import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, Injector, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { SessionKickedDialogComponent } from '../auth/session-kicked-dialog.component';
import {
  Observable,
  catchError,
  defer,
  finalize,
  firstValueFrom,
  from,
  shareReplay,
  throwError,
  timeout,
} from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  permissionCandidates,
  actionAliases,
  moduleAliases,
} from '../auth/permission-codes';
import { apiErrorMessage } from '../http/api-error';
import { MENU_ITEMS, flattenMenuItems } from '../nav/menu-items';
import { MenuCode, PermissionAction } from '../models/permission.model';
import {
  AuthProfile,
  AuthSession,
  User,
  mapAuthProfileToUser,
} from '../models/user.model';
import { UserService } from './user.service';
import { AvatarService } from './avatar.service';

import {
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  RefreshPolicy,
  StoredAuthTokens,
  TokenStorageService,
} from './token-storage.service';

const LEGACY_SESSION_KEY = 'cpams_auth_session';
const BOOT_TIMEOUT_MS = 8000;

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

interface AuthChannelMessage {
  type: 'tokens' | 'logout';
  accessToken?: string;
  refreshToken?: string;
  policy?: RefreshPolicy;
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
  private readonly avatars = inject(AvatarService);
  private readonly tokenStorage = inject(TokenStorageService);
  private readonly base = `${environment.apiBaseUrl}/auth`;

  private readonly sessionSignal = signal<AuthSession | null>(null);
  private refreshInFlight$: Observable<AuthTokens> | null = null;
  private readonly tabId = createTabId();
  private channel: BroadcastChannel | null = null;
  private peerWaiters: Array<(tokens: AuthTokens | null) => void> = [];
  private loggingOut = false;
  private kickDialogOpen = false;
  private readonly injector = inject(Injector);

  readonly initStatus = signal<'idle' | 'loading' | 'done' | 'failed'>('idle');
  /** เหตุผลที่หลุดจากระบบ (ข้อความจาก BE) — หน้าล็อกอินแสดงแล้วล้าง */
  readonly signedOutNotice = signal<string | null>(null);
  private initPromise: Promise<void> | null = null;
  private refreshPolicy: RefreshPolicy = 'session';

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

  /**
   * ตรงกับ BE assertCanReview — ADMIN ขึ้นไปตรวจงานตัวเองได้ · USER ห้ามตรวจงานที่ตัวเองรับผิดชอบ
   * สิทธิ์อื่น (ผู้มอบหมาย/ผู้จัดการโปรเจกต์) ให้ BE ตัดสิน — 403 แสดงข้อความจาก BE
   */
  blocksSelfReview(task: { assignedUserId: number | null } | null | undefined): boolean {
    const me = this.currentUser();
    return !!task && !!me && !this.isAdminLevel() && task.assignedUserId === me.id;
  }

  get accessToken(): string | null {
    return this.sessionSignal()?.accessToken ?? null;
  }

  get refreshToken(): string | null {
    return this.latestRefreshToken();
  }

  constructor() {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this.channel = new BroadcastChannel('cpams-auth');
        this.channel.onmessage = (event: MessageEvent<AuthChannelMessage>) => {
          try {
            this.onPeerMessage(event.data);
          } catch {
            /* ข้อความข้ามแท็บพังแล้วห้ามล้มแอป */
          }
        };
      }
    } catch {
      this.channel = null;
    }
    try {
      if (typeof window !== 'undefined') {
        window.addEventListener('storage', (event) => {
          try {
            this.onStorageEvent(event);
          } catch {
            /* ignore */
          }
        });
      }
    } catch {
      /* ไม่มี storage event ก็ยังบูตได้ */
    }
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
          this.signedOutNotice.set(null);
          this.users.clearCache();
          this.refreshPolicy = rememberMe ? 'local' : 'session';
          this.tokenStorage.replaceTokens(
            session.accessToken,
            session.refreshToken,
            this.refreshPolicy,
          );
          this.setSession(session);
          this.broadcastTokens(session.accessToken, session.refreshToken);
        }),
        catchError((err) =>
          throwError(
            () => new Error(apiErrorMessage(err, 'เข้าสู่ระบบไม่สำเร็จ')),
          ),
        ),
      );
  }

  /**
   * ต่ออายุ access + refresh ครั้งเดียวต่อรอบ (คิว request ที่ 401 พร้อมกัน)
   * ใช้ใบในที่เก็บล่าสุดเท่านั้น — ห้ามยิงซ้ำด้วยใบที่ถูกหมุนไปแล้ว
   */
  refresh(opts?: { silent?: boolean; boot?: boolean }): Observable<AuthTokens> {
    if (this.refreshInFlight$) {
      return this.refreshInFlight$;
    }

    const silent = opts?.silent === true;
    const boot = opts?.boot === true;
    this.refreshInFlight$ = defer(() => from(this.refreshOnce(silent, boot))).pipe(
      finalize(() => {
        this.refreshInFlight$ = null;
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.refreshInFlight$;
  }

  logout(): void {
    this.loggingOut = true;
    this.signedOutNotice.set(null);
    const clearAndGo = () => {
      this.clearSession(true);
      this.loggingOut = false;
      void this.router.navigateByUrl('/login', { replaceUrl: true });
    };

    const callLogout = () => {
      this.http.post<void>(`${this.base}/logout`, {}).subscribe({
        next: () => clearAndGo(),
        error: () => clearAndGo(),
      });
    };

    if (!this.latestRefreshToken() && !this.accessToken) {
      clearAndGo();
      return;
    }

    if (this.latestRefreshToken()) {
      this.refresh({ silent: true }).subscribe({
        next: () => callLogout(),
        error: () => callLogout(),
      });
      return;
    }

    callLogout();
  }

  /** ดึงโปรไฟล์ล่าสุด — ไม่หมุน refresh เอง ถ้า access หมด interceptor จะ refresh แล้วเรียก /me ซ้ำ */
  refreshSession(): void {
    if (!this.accessToken && !this.latestRefreshToken()) {
      return;
    }
    this.http.get<AuthProfile>(`${this.base}/me`).subscribe({
      next: (profile) => this.applyProfile(profile),
      error: () => {
        /* 401 ให้ interceptor ต่ออายุ — อย่าล้าง refresh ตรงนี้ */
      },
    });
  }

  /**
   * PATCH /users/me — fullName / nickname (ส่งเฉพาะที่เปลี่ยน · username ห้ามส่ง)
   * คืน AuthProfile → แทน session ทันที ไม่ต้องเรียก /auth/me ซ้ำ
   */
  updateMyProfile(input: { fullName?: string; nickname?: string | null }): Observable<void> {
    return this.http
      .patch<AuthProfile>(`${environment.apiBaseUrl}/users/me`, input)
      .pipe(this.applyProfileResult());
  }

  /** POST /users/me/avatar — multipart ฟิลด์ `file` */
  uploadMyAvatar(file: File): Observable<void> {
    const form = new FormData();
    form.append('file', file);
    return this.http
      .post<AuthProfile>(`${environment.apiBaseUrl}/users/me/avatar`, form)
      .pipe(this.applyProfileResult());
  }

  /** DELETE /users/me/avatar — ไม่มีรูปอยู่แล้วก็ได้ 200 */
  deleteMyAvatar(): Observable<void> {
    return this.http
      .delete<AuthProfile>(`${environment.apiBaseUrl}/users/me/avatar`)
      .pipe(this.applyProfileResult());
  }

  private applyProfileResult() {
    return (source: Observable<AuthProfile>): Observable<void> =>
      source.pipe(
        tap((profile) => this.applyProfile(profile)),
        map(() => undefined),
        catchError((err) =>
          throwError(() => {
            const bodyMessage = (err as HttpErrorResponse)?.error?.message;
            if ((err as HttpErrorResponse)?.status === 413 && typeof bodyMessage !== 'string') {
              return new Error('ไฟล์มีขนาดใหญ่เกินกำหนด');
            }
            return new Error(apiErrorMessage(err));
          })
        )
      );
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
    // เมนูบทบาท — สงวน Super Admin (role.view/manage ติ๊กใน Role ไม่ผ่าน)
    if (menuCode === 'roles') {
      return session.user.accountType === 'SUPER_ADMIN';
    }
    // ประวัติการใช้งาน — กั้นด้วย accountType ADMIN ขึ้นไป (ไม่ใช่ audit.view)
    if (menuCode === 'audit-logs') {
      return (
        session.user.accountType === 'SUPER_ADMIN' ||
        session.user.accountType === 'ADMIN'
      );
    }
    // แดชบอร์ดของฉัน — GET /dashboard/me เรียกได้ทุกคน (ช่องที่ไม่มีสิทธิ์ BE ส่ง null)
    if (menuCode === 'my-dashboard') {
      return true;
    }
    // หน้าแรก — รวมงานที่มีสิทธิ์ดู (ไม่มี permission แยกเป็นหลัก)
    if (menuCode === 'dashboard') {
      return (
        this.hasPermissionCode('dashboard.view') ||
        this.hasPermissionCode('ticket.view') ||
        this.hasPermissionCode('task.view') ||
        this.hasPermissionCode('followup.view') ||
        this.hasPermissionCode('project.view')
      );
    }
    if (menuCode === 'tasks-review') {
      return this.canAccessTaskReviewQueue();
    }
    if (menuCode === 'ticket-workflow') {
      return this.canAccessTicketSupportQueue();
    }
    if (menuCode === 'ticket-admin-queue') {
      return this.canAccessTicketAdminQueue();
    }
    if (menuCode === 'tickets-mine') {
      return this.canAccessMyTickets();
    }
    // เมนู/ปุ่มอื่น — ใช้ permissions[] จาก /auth/me เท่านั้น (ห้าม bypass ด้วย accountType)
    const perms = session.permissions;
    if (
      permissionCandidates(menuCode, action).some((code) =>
        perms.includes(code),
      )
    ) {
      return true;
    }
    // เมนู「ปัญหา」ต้องมี ticket.view จริง — ห้ามเปิดด้วยแค่ create/assign
    if (menuCode === 'tickets' && action === 'view') {
      return false;
    }
    // เมนูใช้ *.view — ห้ามเปิดเมนูด้วยแค่ create/update ของโมดูล
    return false;
  }

  /** เช็ครหัสสิทธิ์ตรงๆ เช่น task.update, delivery.create */
  hasPermissionCode(code: string): boolean {
    const [module, action] = code.split('.');
    // role.* สงวน Super Admin — ติ๊กใน Role ไม่ผ่าน
    if (module === 'role' || module === 'permission') {
      return this.isSuperAdmin();
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
    if (module === 'role' || module === 'permission') {
      return this.isSuperAdmin();
    }
    const perms = this.sessionSignal()?.permissions ?? [];
    return moduleAliases(module).some(
      (m) => perms.includes(m) || perms.some((p) => p.startsWith(`${m}.`)),
    );
  }

  getVisibleMenuCodes(): MenuCode[] {
    return flattenMenuItems(MENU_ITEMS)
      .filter((item) => this.hasPermission(item.code, 'view'))
      .map((item) => item.code);
  }

  /**
   * คิวงานรอตรวจ — task.review จาก /auth/me เท่านั้น
   * ห้ามใช้ task.update · ห้าม bypass accountType
   */
  canAccessTaskReviewQueue(): boolean {
    return this.hasPermissionCode('task.review');
  }

  /**
   * คิวซัพพอร์ต — ticket.support_queue เท่านั้น
   * ห้ามเปิดด้วย ticket.create / ticket.update
   */
  canAccessTicketSupportQueue(): boolean {
    return this.hasPermissionCode('ticket.support_queue');
  }

  /**
   * 「ใบของฉัน」= ใบที่ assigned ให้ผู้ใช้ปัจจุบัน — ticket.view
   */
  canAccessMyTickets(): boolean {
    return this.hasPermissionCode('ticket.view');
  }

  /**
   * คิวแอดมิน — ticket.assign จาก /auth/me เท่านั้น
   * ห้ามใช้ ticket.view
   */
  canAccessTicketAdminQueue(): boolean {
    return this.hasPermissionCode('ticket.assign');
  }

  /** มีเมนูอย่างน้อยหนึ่งรายการ (permissions จาก /auth/me หรือเมนูตั้งค่าตาม accountType) */
  hasAnyMenuAccess(): boolean {
    if (this.isSuperAdmin() || this.isAdminLevel()) {
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
      return '/app/home';
    }
    const first = flattenMenuItems(MENU_ITEMS).find((item) => codes.includes(item.code));
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

  private clearSession(broadcast = false): void {
    this.sessionSignal.set(null);
    this.tokenStorage.clearRefreshToken();
    this.users.clearCache();
    this.avatars.clear();
    if (broadcast) {
      this.channel?.postMessage({ type: 'logout' } satisfies AuthChannelMessage);
    }
  }

  initAuthFromStorage(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initStatus.set('loading');
    this.initPromise = this.bootFromStorage().finally(() => {
      this.initPromise = null;
      if (this.initStatus() === 'loading') {
        this.initStatus.set('failed');
      }
    });
    return this.initPromise;
  }

  /** บูตต้องจบเสมอ — token ไม่ครบหรือ storage พังแล้วไป login ห้าม throw ให้แอปขาว */
  private async bootFromStorage(): Promise<void> {
    try {
      const stored =
        this.tokenStorage.getStoredTokens() ?? this.tryReadLegacyRefreshToken();
      if (!stored?.refreshToken) {
        this.initStatus.set('done');
        return;
      }

      this.refreshPolicy = stored.policy;
      this.sessionSignal.set({
        accessToken: stored.accessToken ?? '',
        refreshToken: stored.refreshToken,
        user: ANON_USER,
        permissions: [],
      });

      if (stored.accessToken) {
        try {
          const profile = await withTimeout(
            firstValueFrom(this.http.get<AuthProfile>(`${this.base}/me`)),
            BOOT_TIMEOUT_MS,
          );
          this.applyProfile(profile);
          this.initStatus.set('done');
          return;
        } catch {
          /* access ใช้ไม่ได้ — ลองหมุนด้วย refresh ด้านล่าง */
        }
      }

      const tokens = await withTimeout(
        firstValueFrom(this.refresh({ silent: true, boot: true })),
        BOOT_TIMEOUT_MS,
      );
      if (!tokens.accessToken?.trim() || !tokens.refreshToken?.trim()) {
        throw new Error('refresh ไม่ครบ');
      }

      const profile = await withTimeout(
        firstValueFrom(this.http.get<AuthProfile>(`${this.base}/me`)),
        BOOT_TIMEOUT_MS,
      );
      this.applyProfile(profile);
      this.initStatus.set('done');
    } catch {
      try {
        this.clearSession(false);
      } catch {
        this.sessionSignal.set(null);
      }
      this.initStatus.set('failed');
    }
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

  private latestRefreshToken(): string | null {
    const stored = this.tokenStorage.getRefreshToken()?.token ?? null;
    const memory = this.sessionSignal()?.refreshToken ?? null;
    if (stored && memory && stored !== memory) {
      return stored;
    }
    return stored || memory;
  }

  private async refreshOnce(silent: boolean, boot = false): Promise<AuthTokens> {
    const beforeWait = this.latestRefreshToken();
    let ownedLock = false;
    if (!boot) {
      ownedLock = this.acquireRefreshLock();
    }
    if (!boot && !ownedLock) {
      const peer = await this.waitForPeerTokens(8000, beforeWait);
      if (peer && peer.refreshToken !== beforeWait) {
        return peer;
      }
      ownedLock = this.acquireRefreshLock();
    }

    const sentToken = this.latestRefreshToken();
    try {
      if (!sentToken) {
        this.failAuth(silent);
        throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
      }

      const tokens = await this.postRefresh(sentToken);
      this.persistRotatedTokens(tokens);
      return tokens;
    } catch (err) {
      if (!this.isUnauthorized(err)) {
        throw err;
      }

      const peer = await this.waitForPeerTokens(2000, sentToken, true);
      if (peer && peer.refreshToken !== sentToken) {
        return peer;
      }

      const storedNow = this.tokenStorage.getRefreshToken()?.token ?? null;
      if (storedNow && storedNow !== sentToken) {
        try {
          const tokens = await this.postRefresh(storedNow);
          this.persistRotatedTokens(tokens);
          return tokens;
        } catch (retryErr) {
          if (this.isUnauthorized(retryErr)) {
            this.failAuth(silent, retryErr, boot);
          }
          throw retryErr;
        }
      }

      this.failAuth(silent, err, boot);
      throw err;
    } finally {
      if (ownedLock) {
        this.tokenStorage.clearRefreshLock(this.tabId);
      }
    }
  }

  private postRefresh(refreshToken: string): Promise<AuthTokens> {
    return firstValueFrom(
      this.http
        .post<AuthTokens>(`${this.base}/refresh`, { refreshToken })
        .pipe(timeout(BOOT_TIMEOUT_MS)),
    );
  }

  private persistRotatedTokens(tokens: AuthTokens): void {
    this.tokenStorage.setTokens(
      tokens.accessToken,
      tokens.refreshToken,
      this.refreshPolicy,
    );
    const current = this.sessionSignal();
    this.sessionSignal.set({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: current?.user ?? ANON_USER,
      permissions: current?.permissions ?? [],
    });
    this.broadcastTokens(tokens.accessToken, tokens.refreshToken);
    this.notifyPeerWaiters(tokens);
  }

  private failAuth(silent: boolean, err?: unknown, boot = false): void {
    this.clearSession(false);
    // หน้าต่างนับถอยหลังเปิดอยู่ — คำขอที่ค้างได้ 401 ตามมา ไม่ต้องพาไปล็อกอินก่อนนับเสร็จ
    if (this.kickDialogOpen) {
      return;
    }
    // token เก่าจากการเปิดเว็บครั้งก่อน (ตอนบูต) ไม่ต้องแจ้งบนหน้าล็อกอิน — ผู้ใช้เพิ่งเปิดเว็บ ไม่ได้ถูกเตะระหว่างใช้งาน
    if (boot) {
      this.signedOutNotice.set(null);
    } else if (!this.loggingOut && this.isUnauthorized(err)) {
      // ถูกเตะจากเครื่องอื่น / ออกจากระบบแล้ว — BE ส่งเหตุผลมากับ 401 ของ refresh ให้หน้าล็อกอินแสดง
      const message = apiErrorMessage(err, 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
      this.signedOutNotice.set(message);
      if (!silent && message.includes('เครื่องอื่น')) {
        this.showKickedDialog();
        return;
      }
    }
    if (!silent && !this.loggingOut) {
      try {
        void this.router.navigateByUrl('/login');
      } catch {
        /* router ยังไม่พร้อมระหว่างบูต — guard จะพาไป login เอง */
      }
    }
  }

  /** แจ้งว่าถูกเข้าสู่ระบบจากเครื่องอื่น นับถอยหลัง 5 วิ แล้วไปหน้าล็อกอิน */
  private showKickedDialog(): void {
    this.kickDialogOpen = true;
    const goLogin = () => {
      this.kickDialogOpen = false;
      void this.router.navigateByUrl('/login', { replaceUrl: true });
    };
    try {
      const dialog = this.injector.get(MatDialog);
      dialog.closeAll();
      dialog
        .open(SessionKickedDialogComponent, {
          width: '440px',
          maxWidth: '92vw',
          disableClose: true,
          autoFocus: 'dialog',
        })
        .afterClosed()
        .subscribe(goLogin);
    } catch {
      goLogin();
    }
  }

  private isUnauthorized(err: unknown): boolean {
    return err instanceof HttpErrorResponse && err.status === 401;
  }

  private lockHeldByOther(): boolean {
    const lock = this.tokenStorage.getRefreshLock();
    if (!lock || lock.id === this.tabId) {
      return false;
    }
    return lock.exp > Date.now();
  }

  private acquireRefreshLock(): boolean {
    if (this.lockHeldByOther()) {
      return false;
    }
    this.tokenStorage.setRefreshLock(this.tabId, Date.now() + 12_000);
    return this.tokenStorage.getRefreshLock()?.id === this.tabId;
  }

  private waitForPeerTokens(
    ms: number,
    previousToken?: string | null,
    requireChange = false,
  ): Promise<AuthTokens | null> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (tokens: AuthTokens | null) => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timer);
        window.clearInterval(poll);
        this.peerWaiters = this.peerWaiters.filter((waiter) => waiter !== onTokens);
        resolve(tokens);
      };
      let timer = 0;
      let poll = 0;
      const onTokens = (tokens: AuthTokens | null) => finish(tokens);
      try {
        timer = window.setTimeout(() => finish(null), ms);
        poll = window.setInterval(() => {
          const refreshToken = this.latestRefreshToken();
          const accessToken = this.accessToken;
          if (
            previousToken &&
            refreshToken &&
            refreshToken !== previousToken &&
            accessToken
          ) {
            finish({ accessToken, refreshToken });
            return;
          }
          if (!requireChange && !this.lockHeldByOther()) {
            finish(null);
          }
        }, 150);
        this.peerWaiters.push(onTokens);
      } catch {
        finish(null);
      }
    });
  }

  private notifyPeerWaiters(tokens: AuthTokens | null): void {
    const waiters = this.peerWaiters.splice(0);
    for (const waiter of waiters) {
      waiter(tokens);
    }
  }

  private broadcastTokens(accessToken: string, refreshToken: string): void {
    this.channel?.postMessage({
      type: 'tokens',
      accessToken,
      refreshToken,
      policy: this.refreshPolicy,
    } satisfies AuthChannelMessage);
  }

  private onPeerMessage(message: AuthChannelMessage | null): void {
    if (!message || this.loggingOut) {
      return;
    }
    if (message.type === 'logout') {
      this.clearSession(false);
      void this.router.navigateByUrl('/login', { replaceUrl: true });
      return;
    }
    if (message.type !== 'tokens' || !message.refreshToken) {
      return;
    }
    this.applyExternalTokens(
      message.accessToken ?? '',
      message.refreshToken,
      message.policy,
    );
  }

  private onStorageEvent(event: StorageEvent): void {
    if (this.loggingOut || event.storageArea !== localStorage) {
      return;
    }
    if (event.key !== REFRESH_TOKEN_KEY && event.key !== ACCESS_TOKEN_KEY) {
      return;
    }
    const refreshToken = this.tokenStorage.getRefreshToken()?.token;
    if (!refreshToken) {
      return;
    }
    this.applyExternalTokens(
      this.tokenStorage.getAccessToken() ?? '',
      refreshToken,
      'local',
    );
  }

  private applyExternalTokens(
    accessToken: string,
    refreshToken: string,
    policy?: RefreshPolicy,
  ): void {
    if (policy) {
      this.refreshPolicy = policy;
    }
    const current = this.sessionSignal();
    if (
      current?.refreshToken === refreshToken &&
      current.accessToken === accessToken &&
      accessToken
    ) {
      this.notifyPeerWaiters({
        accessToken,
        refreshToken,
      });
      return;
    }
    const nextAccess = accessToken || current?.accessToken || '';
    if (!nextAccess) {
      this.sessionSignal.set({
        accessToken: '',
        refreshToken,
        user: current?.user ?? ANON_USER,
        permissions: current?.permissions ?? [],
      });
      return;
    }
    this.tokenStorage.setTokens(nextAccess, refreshToken, this.refreshPolicy);
    this.sessionSignal.set({
      accessToken: nextAccess,
      refreshToken,
      user: current?.user ?? ANON_USER,
      permissions: current?.permissions ?? [],
    });
    this.notifyPeerWaiters({
      accessToken: nextAccess,
      refreshToken,
    });
  }

  private tryReadLegacyRefreshToken(): StoredAuthTokens | null {
    try {
      const raw = localStorage.getItem(LEGACY_SESSION_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as Partial<AuthSession>;
      const refreshToken =
        typeof parsed?.refreshToken === 'string' ? parsed.refreshToken.trim() : '';
      if (!refreshToken) {
        return null;
      }
      const accessToken =
        typeof parsed?.accessToken === 'string' && parsed.accessToken.trim()
          ? parsed.accessToken.trim()
          : null;
      return { refreshToken, accessToken, policy: 'local' };
    } catch {
      return null;
    }
  }
}

function createTabId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* insecure context */
  }
  return `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('boot timeout')), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
