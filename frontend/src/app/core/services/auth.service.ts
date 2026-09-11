import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  Observable,
  catchError,
  finalize,
  firstValueFrom,
  shareReplay,
  throwError,
} from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  permissionCandidates,
  hasAnyModulePermission,
  actionAliases,
  moduleAliases,
} from '../auth/permission-codes';
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

import { TokenStorageService } from './token-storage.service';

const LEGACY_SESSION_KEY = 'cpams_auth_session';

const ANON_USER: User = {
  id: 0,
  employeeCode: null,
  username: '',
  email: null,
  fullName: '',
  nickname: null,
  phone: null,
  position: null,
  avatarUrl: null,
  lineUserId: null,
  accountType: 'USER',
  status: 'ACTIVE',
  lastLoginAt: null,
  roles: [],
  createdAt: '',
  updatedAt: '',
};

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
  private readonly tokenStorage = inject(TokenStorageService);
  private readonly base = `${environment.apiBaseUrl}/auth`;

  private readonly sessionSignal = signal<AuthSession | null>(null);
  private refreshInFlight$: Observable<AuthTokens> | null = null;

  readonly initStatus = signal<'idle' | 'loading' | 'done' | 'failed'>('idle');
  private initPromise: Promise<void> | null = null;
  private refreshPolicy: 'local' | 'session' = 'session';

  readonly session = this.sessionSignal.asReadonly();
  readonly currentUser = computed(() => this.sessionSignal()?.user ?? null);
  readonly isAuthenticated = computed(
    () => !!this.sessionSignal()?.accessToken,
  );
  readonly isSuperAdmin = computed(
    () => this.currentUser()?.accountType === 'SUPER_ADMIN',
  );
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
    // ใช้งานผ่าน APP_INITIALIZER แล้วค่อย initAuthFromStorage()
  }

  /** รอให้ hydrate session จาก storage เสร็จ — ใช้ใน route guard */
  whenReady(): Promise<void> {
    const status = this.initStatus();
    if (status === 'done' || status === 'failed') {
      return Promise.resolve();
    }
    return this.initAuthFromStorage();
  }

  login(
    username: string,
    password: string,
    rememberMe: boolean,
  ): Observable<AuthSession> {
    // กันล็อกอินซ้อน — ต้องออกจากระบบก่อนถึงจะเข้าบัญชีอื่นได้
    if (this.isAuthenticated()) {
      return throwError(
        () => new Error('คุณเข้าสู่ระบบอยู่แล้ว กรุณาออกจากระบบก่อน'),
      );
    }

    return this.http
      .post<LoginResponse>(`${this.base}/login`, { username, password })
      .pipe(
        map((res) => this.toSession(res)),
        tap((session) => {
          this.users.clearCache();
          this.refreshPolicy = rememberMe ? 'local' : 'session';
          this.tokenStorage.setRefreshToken(
            session.refreshToken,
            this.refreshPolicy,
          );
          this.setSession(session);
        }),
        catchError((err) =>
          throwError(
            () => new Error(apiErrorMessage(err, 'เข้าสู่ระบบไม่สำเร็จ')),
          ),
        ),
      );
  }

  /** ต่ออายุ access + refresh (หมุนใบใหม่ทับเสมอ) */
  refresh(
    refreshTokenOverride?: string,
    opts?: { silent?: boolean },
  ): Observable<AuthTokens> {
    if (this.refreshInFlight$) {
      return this.refreshInFlight$;
    }
    const refreshToken = refreshTokenOverride ?? this.refreshToken;
    if (!refreshToken) {
      this.clearSession();
      if (!opts?.silent) {
        void this.router.navigateByUrl('/login');
      }
      return throwError(() => new Error('ไม่มี refresh token'));
    }

    this.refreshInFlight$ = this.http
      .post<AuthTokens>(`${this.base}/refresh`, { refreshToken })
      .pipe(
        tap((tokens) => {
          const current = this.sessionSignal();
          this.tokenStorage.setRefreshToken(
            tokens.refreshToken,
            this.refreshPolicy,
          );
          this.sessionSignal.set({
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            user: current?.user ?? ANON_USER,
            permissions: current?.permissions ?? [],
          });
        }),
        catchError((err) => {
          this.clearSession();
          if (!opts?.silent) {
            void this.router.navigateByUrl('/login');
          }
          return throwError(() => err);
        }),
        finalize(() => {
          this.refreshInFlight$ = null;
        }),
        shareReplay(1),
      );

    return this.refreshInFlight$;
  }

  logout(): void {
    const accessToken = this.accessToken;
    const clearAndGo = () => {
      this.clearSession();
      void this.router.navigateByUrl('/login', { replaceUrl: true });
    };

    if (!accessToken) {
      clearAndGo();
      return;
    }

    // logout ต้องส่ง access token (Authorization header) ผ่าน interceptor
    this.http.post<void>(`${this.base}/logout`, {}).subscribe({
      next: () => clearAndGo(),
      error: () => clearAndGo(),
    });
  }

  /** ดึงโปรไฟล์ + permissions ล่าสุด — พยายามต่ออายุ token ด้วย (สิทธิ์ใน JWT อาจค้างหลังแก้บทบาท) */
  refreshSession(): void {
    if (!this.accessToken) {
      return;
    }
    const applyProfile = (profile: AuthProfile) => {
      const current = this.sessionSignal();
      if (!current) {
        return;
      }
      this.setSession({
        ...current,
        user: mapAuthProfileToUser(profile),
        permissions: profile.permissions ?? [],
      });
    };

    const loadMe = () => {
      this.http.get<AuthProfile>(`${this.base}/me`).subscribe({
        next: applyProfile,
        error: () => {
          /* คง session เดิม — ถ้า 401 interceptor จะ refresh / logout */
        },
      });
    };

    if (this.refreshToken) {
      this.refresh().subscribe({
        next: () => loadMe(),
        error: () => loadMe(),
      });
      return;
    }
    loadMe();
  }

  /** เช็คสิทธิ์แบบ API เช่น customer.view — รองรับ edit/update ที่ API ใช้สลับกัน */
  hasPermission(
    menuCode: MenuCode,
    action: PermissionAction | string = 'view',
  ): boolean {
    const session = this.sessionSignal();
    if (!session) {
      return false;
    }
    // เมนูบทบาททั้งหมดสงวนไว้เฉพาะ Super Admin (Admin มองไม่เห็น/เข้าไม่ได้)
    if (menuCode === 'roles') {
      return session.user.accountType === 'SUPER_ADMIN';
    }
    // งานของฉัน — ไม่มี permission แยก เปิดเมื่อมีสิทธิ์ดูอย่างน้อยหนึ่งส่วน (ห้ามเช็ค roles)
    if (menuCode === 'my-work') {
      return (
        this.hasPermissionCode('ticket.view') ||
        this.hasPermissionCode('task.view') ||
        this.hasPermissionCode('followup.view') ||
        this.hasPermissionCode('project.view')
      );
    }
    // SUPER_ADMIN / ADMIN เห็นและใช้ทุกเมนูอื่น
    if (
      session.user.accountType === 'SUPER_ADMIN' ||
      session.user.accountType === 'ADMIN'
    ) {
      return true;
    }
    const perms = session.permissions;
    if (
      permissionCandidates(menuCode, action).some((code) =>
        perms.includes(code),
      )
    ) {
      return true;
    }
    // บางโมดูลใช้ action พิเศษ (เช่น role.manage) — ถือว่ามีสิทธิ์ดูเมนูได้ถ้ามี permission ของโมดูลนั้น
    if (action === 'view') {
      return hasAnyModulePermission(perms, menuCode);
    }
    return false;
  }

  /** เช็ครหัสสิทธิ์ตรงๆ เช่น task.update, delivery.create */
  hasPermissionCode(code: string): boolean {
    const [module, action] = code.split('.');
    if (module === 'role') {
      return this.isSuperAdmin();
    }
    if (this.isAdminLevel()) {
      return true;
    }
    const perms = this.sessionSignal()?.permissions ?? [];
    if (perms.includes(code)) {
      return true;
    }
    if (!module || !action) {
      return false;
    }
    return moduleAliases(module).some((m) =>
      actionAliases(action).some((a) => perms.includes(`${m}.${a}`)),
    );
  }

  /** มีสิทธิ์ใดๆ ของโมดูลนี้หรือไม่ เช่น task / delivery */
  hasModuleAccess(module: string): boolean {
    if (module === 'role') {
      return this.isSuperAdmin();
    }
    if (this.isAdminLevel()) {
      return true;
    }
    const perms = this.sessionSignal()?.permissions ?? [];
    return moduleAliases(module).some(
      (m) => perms.includes(m) || perms.some((p) => p.startsWith(`${m}.`)),
    );
  }

  getVisibleMenuCodes(): MenuCode[] {
    if (this.isSuperAdmin()) {
      return MENU_ITEMS.map((item) => item.code);
    }
    // Admin เห็นทุกเมนูยกเว้นบทบาทและสิทธิ์
    if (this.isAdminLevel()) {
      return MENU_ITEMS.filter((item) => item.code !== 'roles').map(
        (item) => item.code,
      );
    }
    const perms = this.sessionSignal()?.permissions ?? [];
    if (!perms.length) {
      return [];
    }
    return MENU_ITEMS.filter((item) =>
      this.hasPermission(item.code, 'view'),
    ).map((item) => item.code);
  }

  /** SUPER_ADMIN/ADMIN มี roles: [] เสมอ — Admin ระดับระบบเข้าเมนูได้แม้ permissions จาก API ไม่ครบ */
  hasAnyMenuAccess(): boolean {
    if (this.isAdminLevel()) {
      return true;
    }
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
    // บัญชีที่ไม่มี user.view จะ list ผู้ใช้ไม่ได้ — อย่างน้อยต้องมีตัวเองในดรอปดาวน์
    this.users.upsertLocal(session.user);
  }

  private clearSession(): void {
    this.sessionSignal.set(null);
    this.tokenStorage.clearRefreshToken();
    this.users.clearCache();
  }

  initAuthFromStorage(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initStatus.set('loading');

    const stored =
      this.tokenStorage.getRefreshToken() ?? this.tryReadLegacyRefreshToken();
    if (!stored) {
      this.initStatus.set('done');
      return Promise.resolve();
    }

    this.refreshPolicy = stored.policy;

    // Block การรันของ route guard จนกว่าจะ refresh / โหลดโปรไฟล์เสร็จ
    this.initPromise = (async () => {
      try {
        // refresh() จะใส่ accessToken + refreshToken ลงใน sessionSignal ให้ก่อน
        await firstValueFrom(this.refresh(stored.token, { silent: true }));
        const profile = await firstValueFrom(
          this.http.get<AuthProfile>(`${this.base}/me`),
        );
        this.applyProfile(profile);
        this.initStatus.set('done');
      } catch {
        this.clearSession();
        this.initStatus.set('failed');
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  private applyProfile(profile: AuthProfile): void {
    const current = this.sessionSignal();
    if (!current) {
      return;
    }

    const user = mapAuthProfileToUser(profile);
    this.sessionSignal.set({
      ...current,
      user,
      permissions: profile.permissions ?? [],
    });
    this.users.upsertLocal(user);
  }

  private tryReadLegacyRefreshToken(): {
    token: string;
    policy: 'local' | 'session';
  } | null {
    try {
      const raw = localStorage.getItem(LEGACY_SESSION_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as Partial<AuthSession>;
      const refreshToken =
        typeof parsed?.refreshToken === 'string' ? parsed.refreshToken : null;
      if (!refreshToken) {
        return null;
      }
      // legacy เก็บ refreshToken ใน localStorage เสมอ
      this.tokenStorage.setRefreshToken(refreshToken, 'local');
      return { token: refreshToken, policy: 'local' };
    } catch {
      return null;
    }
  }
}
