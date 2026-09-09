import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, shareReplay, throwError } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { permissionCode, MENU_PERMISSION_MODULE } from '../auth/permission-codes';
import { apiErrorMessage } from '../http/api-error';
import { MENU_ITEMS } from '../nav/menu-items';
import { MenuCode, PermissionAction } from '../models/permission.model';
import {
  AuthProfile,
  AuthSession,
  User,
  mapAuthProfileToUser,
} from '../models/user.model';
import { UserService } from './user.service';

const STORAGE_KEY = 'cpams_auth_session';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface LoginResponse extends AuthTokens {
  tokenType?: string;
  user: AuthProfile;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly users = inject(UserService);
  private readonly base = `${environment.apiBaseUrl}/auth`;

  private readonly sessionSignal = signal<AuthSession | null>(null);
  private refreshInFlight$: Observable<AuthTokens> | null = null;

  readonly session = this.sessionSignal.asReadonly();
  readonly currentUser = computed(() => this.sessionSignal()?.user ?? null);
  readonly isAuthenticated = computed(() => !!this.sessionSignal()?.accessToken);
  readonly isSuperAdmin = computed(() => this.currentUser()?.accountType === 'SUPER_ADMIN');
  readonly isAdminLevel = computed(() => {
    const type = this.currentUser()?.accountType;
    return type === 'SUPER_ADMIN' || type === 'ADMIN';
  });

  get accessToken(): string | null {
    return this.sessionSignal()?.accessToken ?? null;
  }

  get refreshToken(): string | null {
    return this.sessionSignal()?.refreshToken ?? null;
  }

  constructor() {
    this.restoreFromStorage();
  }

  login(username: string, password: string): Observable<AuthSession> {
    return this.http.post<LoginResponse>(`${this.base}/login`, { username, password }).pipe(
      map((res) => this.toSession(res)),
      tap((session) => {
        this.users.clearCache();
        this.setSession(session);
      }),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err, 'เข้าสู่ระบบไม่สำเร็จ'))))
    );
  }

  /** ต่ออายุ access + refresh (หมุนใบใหม่ทับเสมอ) */
  refresh(): Observable<AuthTokens> {
    if (this.refreshInFlight$) {
      return this.refreshInFlight$;
    }
    const refreshToken = this.refreshToken;
    if (!refreshToken) {
      this.clearSession();
      return throwError(() => new Error('ไม่มี refresh token'));
    }

    this.refreshInFlight$ = this.http
      .post<AuthTokens>(`${this.base}/refresh`, { refreshToken })
      .pipe(
        tap((tokens) => {
          const current = this.sessionSignal();
          if (!current) {
            return;
          }
          this.setSession({
            ...current,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
          });
        }),
        catchError((err) => {
          this.clearSession();
          void this.router.navigateByUrl('/login');
          return throwError(() => err);
        }),
        finalize(() => {
          this.refreshInFlight$ = null;
        }),
        shareReplay(1)
      );

    return this.refreshInFlight$;
  }

  logout(): void {
    const refreshToken = this.refreshToken;
    const clearAndGo = () => {
      this.clearSession();
      void this.router.navigateByUrl('/login');
    };

    if (!refreshToken) {
      clearAndGo();
      return;
    }

    this.http.post<void>(`${this.base}/logout`, { refreshToken }).subscribe({
      next: () => clearAndGo(),
      error: () => clearAndGo(),
    });
  }

  /** ดึงโปรไฟล์ + permissions ล่าสุดจากเซิร์ฟเวอร์ */
  refreshSession(): void {
    if (!this.accessToken) {
      return;
    }
    this.http.get<AuthProfile>(`${this.base}/me`).subscribe({
      next: (profile) => {
        const current = this.sessionSignal();
        if (!current) {
          return;
        }
        this.setSession({
          ...current,
          user: mapAuthProfileToUser(profile),
          permissions: profile.permissions ?? [],
        });
      },
      error: () => {
        /* คง session เดิม — ถ้า 401 interceptor จะ refresh / logout */
      },
    });
  }

  /** เช็คสิทธิ์แบบ API เช่น customer.view */
  hasPermission(menuCode: MenuCode, action: PermissionAction | string = 'view'): boolean {
    const session = this.sessionSignal();
    if (!session) {
      return false;
    }
    if (menuCode === 'roles' && action !== 'view' && session.user.accountType !== 'SUPER_ADMIN') {
      return false;
    }
    const code = permissionCode(menuCode, action);
    if (session.permissions.includes(code)) {
      return true;
    }
    // บางโมดูลใช้ action พิเศษ (เช่น role.manage) — ถือว่ามีสิทธิ์ดูเมนูได้ถ้ามี permission ของโมดูลนั้น
    if (action === 'view') {
      const prefix = `${MENU_PERMISSION_MODULE[menuCode]}.`;
      return session.permissions.some((p) => p.startsWith(prefix));
    }
    return false;
  }

  getVisibleMenuCodes(): MenuCode[] {
    const perms = this.sessionSignal()?.permissions ?? [];
    if (!perms.length) {
      return [];
    }
    return MENU_ITEMS.filter((item) => this.hasPermission(item.code, 'view')).map((item) => item.code);
  }

  /** SUPER_ADMIN/ADMIN มี roles: [] เสมอ — ต้องดู permissions เท่านั้น */
  hasAnyMenuAccess(): boolean {
    return (this.sessionSignal()?.permissions.length ?? 0) > 0;
  }

  defaultAppPath(): string {
    if (!this.hasAnyMenuAccess()) {
      return '/app/no-access';
    }
    const codes = this.getVisibleMenuCodes();
    if (codes.includes('dashboard')) {
      return '/app/dashboard';
    }
    const first = MENU_ITEMS.find((item) => codes.includes(item.code));
    return first?.route ?? '/app/no-access';
  }

  private toSession(res: LoginResponse): AuthSession {
    const profile = res.user;
    return {
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
      user: mapAuthProfileToUser(profile),
      permissions: profile.permissions ?? [],
    };
  }

  private setSession(session: AuthSession): void {
    this.sessionSignal.set(session);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    // บัญชีที่ไม่มี user.view จะ list ผู้ใช้ไม่ได้ — อย่างน้อยต้องมีตัวเองในดรอปดาวน์
    this.users.upsertLocal(session.user);
  }

  private clearSession(): void {
    this.sessionSignal.set(null);
    localStorage.removeItem(STORAGE_KEY);
    this.users.clearCache();
  }

  private restoreFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }
      const stored = JSON.parse(raw) as AuthSession;
      if (!stored?.accessToken || !stored?.refreshToken || !stored?.user) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      // session เก่าที่เก็บ permissions เป็น object[] ให้ทิ้ง แล้วล็อกอินใหม่
      if (!Array.isArray(stored.permissions) || stored.permissions.some((p) => typeof p !== 'string')) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      this.sessionSignal.set(stored);
      this.users.upsertLocal(stored.user);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
}
