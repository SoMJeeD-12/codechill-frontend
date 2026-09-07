import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, delay, of, throwError } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ALL_PERMISSIONS, MENU_ITEMS } from '../mock/mock-data';
import { MenuCode, Permission, PermissionAction } from '../models/permission.model';
import { AuthSession, User } from '../models/user.model';
import { RoleService } from './role.service';
import { UserService } from './user.service';

const STORAGE_KEY = 'cpams_mock_session';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);
  private readonly users = inject(UserService);
  private readonly roles = inject(RoleService);

  private readonly sessionSignal = signal<AuthSession | null>(null);

  readonly session = this.sessionSignal.asReadonly();
  readonly currentUser = computed(() => this.sessionSignal()?.user ?? null);
  readonly isAuthenticated = computed(() => !!this.sessionSignal());
  readonly isSuperAdmin = computed(() => this.currentUser()?.accountType === 'SUPER_ADMIN');
  readonly isAdminLevel = computed(() => {
    const type = this.currentUser()?.accountType;
    return type === 'SUPER_ADMIN' || type === 'ADMIN';
  });

  constructor() {
    this.rehydrate();
  }

  login(username: string, password: string): Observable<AuthSession> {
    const user = this.users.findByUsername(username);

    if (!user || !this.users.verifyPassword(user.id, password)) {
      return throwError(() => new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')).pipe(delay(400));
    }

    if (user.status !== 'ACTIVE') {
      return throwError(() => new Error('บัญชีนี้ไม่สามารถเข้าสู่ระบบได้ (พักงานหรือสิ้นสุดการปฏิบัติงาน)')).pipe(
        delay(400)
      );
    }

    this.users.touchLogin(user.id);
    const fresh = this.users.getById(user.id)!;
    const session = this.buildSession(fresh);

    return of(session).pipe(
      delay(450),
      tap((s) => {
        this.persist(s);
        this.sessionSignal.set(s);
      })
    );
  }

  logout(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.sessionSignal.set(null);
    void this.router.navigateByUrl('/login');
  }

  /** เรียกหลังแก้บทบาท/ผูกบทบาท เพื่ออัปเดตเมนูของ session ปัจจุบัน */
  refreshSession(): void {
    const current = this.sessionSignal();
    if (!current) {
      return;
    }
    const user = this.users.getById(current.user.id);
    if (!user || user.status !== 'ACTIVE') {
      this.logout();
      return;
    }
    const session = this.buildSession(user);
    this.persist(session);
    this.sessionSignal.set(session);
  }

  hasPermission(menuCode: MenuCode, action: PermissionAction = 'view'): boolean {
    const session = this.sessionSignal();
    if (!session) {
      return false;
    }
    // สร้าง/แก้บทบาทสงวน Super Admin แม้ Admin จะมีสิทธิ์เมนู roles
    if (menuCode === 'roles' && action !== 'view' && session.user.accountType !== 'SUPER_ADMIN') {
      return false;
    }
    const perm = session.permissions.find((p) => p.menuCode === menuCode);
    return !!perm?.actions.includes(action);
  }

  getVisibleMenuCodes(): MenuCode[] {
    return (this.sessionSignal()?.permissions ?? [])
      .filter((p) => p.actions.includes('view'))
      .map((p) => p.menuCode);
  }

  hasAnyMenuAccess(): boolean {
    return this.getVisibleMenuCodes().length > 0;
  }

  /** หน้าแรกหลังล็อกอิน / เมื่อไม่มีสิทธิ์หน้าที่ขอ */
  defaultAppPath(): string {
    const codes = this.getVisibleMenuCodes();
    if (codes.includes('dashboard')) {
      return '/app/dashboard';
    }
    const first = MENU_ITEMS.find((item) => codes.includes(item.code));
    return first?.route ?? '/app/no-access';
  }

  private buildSession(user: User): AuthSession {
    return {
      token: `mock-jwt-${user.id}-${Date.now()}`,
      user: { ...user },
      permissions: this.resolvePermissions(user),
    };
  }

  private resolvePermissions(user: User): Permission[] {
    if (user.accountType === 'SUPER_ADMIN' || user.accountType === 'ADMIN') {
      return structuredClone(ALL_PERMISSIONS);
    }

    const merged = new Map<MenuCode, Set<PermissionAction>>();
    for (const roleId of user.roleIds) {
      const role = this.roles.getById(roleId);
      if (!role) {
        continue;
      }
      for (const perm of role.permissions) {
        const set = merged.get(perm.menuCode) ?? new Set<PermissionAction>();
        perm.actions.forEach((a: PermissionAction) => set.add(a));
        merged.set(perm.menuCode, set);
      }
    }

    return Array.from(merged.entries()).map(([menuCode, actions]) => ({
      menuCode,
      actions: Array.from(actions),
    }));
  }

  private rehydrate(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }
      const stored = JSON.parse(raw) as AuthSession;
      const user = this.users.getById(stored.user.id);
      if (!user || user.status !== 'ACTIVE') {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      const session = this.buildSession(user);
      this.persist(session);
      this.sessionSignal.set(session);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  private persist(session: AuthSession): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }
}
