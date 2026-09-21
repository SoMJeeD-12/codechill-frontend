import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, of, throwError } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { apiErrorMessage } from '../http/api-error';
import { asList, pruneUndefined, toHttpParams, upsertById } from '../http/api.util';
import { AccountType, User, UserStatus, UserSummary } from '../models/user.model';

/** query `capability` ของ GET /users/assignable — Backend กรอง permission + ACTIVE ให้แล้ว */
export type AssignableCapability = 'TASK' | 'TICKET' | 'TASK_REVIEW';

/** CreateUserDto */
export interface CreateUserInput {
  username: string;
  password: string;
  fullName: string;
  employeeCode?: string;
  email?: string;
  nickname?: string;
  phone?: string;
  position?: string;
  avatarUrl?: string;
  lineUserId?: string;
  accountType?: AccountType;
  roleIds?: number[];
}

/** UpdateUserDto — ไม่มี status / roleIds / password (มี endpoint แยก) */
export interface UpdateUserInput {
  fullName?: string;
  employeeCode?: string;
  email?: string;
  nickname?: string;
  phone?: string;
  position?: string;
  avatarUrl?: string;
  lineUserId?: string;
  accountType?: AccountType;
}

export interface UserListParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  status?: UserStatus;
  accountType?: AccountType;
  roleId?: number;
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/users`;
  private readonly usersSignal = signal<User[]>([]);
  /** รายชื่อล่าสุดต่อ capability สำหรับดรอปดาวน์ — ไม่กรอง role ฝั่ง FE */
  private readonly assignableMap = signal<Record<AssignableCapability, User[]>>({
    TASK: [],
    TICKET: [],
    TASK_REVIEW: [],
  });

  readonly users = this.usersSignal.asReadonly();
  readonly assignableTask = computed(() => this.assignableMap().TASK);
  readonly assignableTicket = computed(() => this.assignableMap().TICKET);
  readonly assignableTaskReview = computed(() => this.assignableMap().TASK_REVIEW);
  readonly activeCount = computed(
    () => this.usersSignal().filter((u) => u.status === 'ACTIVE').length
  );

  list(params?: UserListParams): Observable<User[]> {
    return this.http
      .get<User[] | { items: User[] }>(this.base, { params: toHttpParams({ ...params }) })
      .pipe(
        map(asList),
        tap((list) => this.usersSignal.set(list)),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  /**
   * GET /users/assignable?capability=
   * — TASK / TICKET / TASK_REVIEW
   * Backend กรอง permission + ACTIVE แล้ว · FE แสดงตามที่คืนมา ไม่กรอง roles.length / ชื่อ Role
   */
  listAssignable(capability: AssignableCapability): Observable<User[]> {
    return this.http
      .get<UserSummary[] | User[]>(`${this.base}/assignable`, {
        params: toHttpParams({ capability }),
      })
      .pipe(
        map((rows) => (Array.isArray(rows) ? rows : []).map((u) => this.toUser(u))),
        tap((list) => {
          this.assignableMap.update((prev) => ({ ...prev, [capability]: list }));
          for (const user of list) {
            this.upsertLocal(user);
          }
        }),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  /**
   * สำหรับดรอปดาวน์มอบหมาย / ผู้จัดการ / ผู้ดูแล
   * - ใส่ seed (เช่น user ที่ล็อกอิน) ในรายการเสมอ
   * - ถ้า /users/assignable ว่าง → ใช้รายชื่อ ACTIVE จาก /users เป็นทางเลือก
   */
  loadForPicker(
    seed?: User | UserSummary | null,
    opts?: { capability: AssignableCapability }
  ): Observable<User[]> {
    const capability = opts?.capability ?? 'TASK';
    if (seed) {
      this.upsertLocal(seed);
    }
    return this.listAssignable(capability).pipe(
      switchMap((list) => {
        if (list.length > 0) {
          return of(this.mergeSeedIntoAssignable(capability, list, seed));
        }
        return this.list({ status: 'ACTIVE', limit: 100 }).pipe(
          map((users) => this.mergeSeedIntoAssignable(capability, users, seed)),
          catchError(() => of(this.mergeSeedIntoAssignable(capability, [], seed)))
        );
      }),
      catchError(() =>
        this.list({ status: 'ACTIVE', limit: 100 }).pipe(
          map((users) => this.mergeSeedIntoAssignable(capability, users, seed)),
          catchError(() => of(this.mergeSeedIntoAssignable(capability, [], seed)))
        )
      )
    );
  }

  /** รวม seed เข้า assignable map — ให้ดรอปดาวน์มีอย่างน้อยคนที่ล็อกอินอยู่ */
  private mergeSeedIntoAssignable(
    capability: AssignableCapability,
    list: User[],
    seed?: User | UserSummary | null
  ): User[] {
    let merged = list;
    if (seed) {
      const u = this.toUser(seed);
      if (!merged.some((x) => x.id === u.id)) {
        merged = [u, ...merged];
      }
    }
    this.assignableMap.update((prev) => ({ ...prev, [capability]: merged }));
    for (const user of merged) {
      this.upsertLocal(user);
    }
    return merged;
  }

  clearCache(): void {
    this.usersSignal.set([]);
    this.assignableMap.set({ TASK: [], TICKET: [], TASK_REVIEW: [] });
  }

  /** ใส่ผู้ใช้ลงแคชโดยไม่ต้องมีสิทธิ์ list (เช่น จาก session หรือ summary ใน ticket) */
  upsertLocal(user: User | UserSummary): void {
    const normalized = this.toUser(user);
    this.usersSignal.update((list) => upsertById(list, normalized));
  }

  getById(id: number): User | undefined {
    return this.usersSignal().find((u) => u.id === id);
  }

  private toUser(user: User | UserSummary): User {
    if ('accountType' in user && user.accountType) {
      return user as User;
    }
    const summary = user as UserSummary;
    const existing = this.getById(summary.id);
    if (existing) {
      return {
        ...existing,
        username: summary.username || existing.username,
        fullName: summary.fullName || existing.fullName,
      };
    }
    return {
      id: summary.id,
      employeeCode: null,
      username: summary.username,
      email: null,
      fullName: summary.fullName,
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
  }

  create(input: CreateUserInput): Observable<User> {
    return this.http.post<User>(this.base, pruneUndefined(input)).pipe(
      tap((user) => this.usersSignal.update((list) => upsertById(list, user))),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  /** PUT /users/{id} — เฉพาะข้อมูลโปรไฟล์ */
  update(id: number, input: UpdateUserInput): Observable<User> {
    return this.http.put<User>(`${this.base}/${id}`, pruneUndefined(input)).pipe(
      tap((user) => this.usersSignal.update((list) => upsertById(list, user))),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  /** PUT /users/{id}/roles — AssignRolesDto */
  assignRoles(id: number, roleIds: number[]): Observable<User> {
    return this.http.put<User>(`${this.base}/${id}/roles`, { roleIds }).pipe(
      tap((user) => this.usersSignal.update((list) => upsertById(list, user))),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  updateStatus(id: number, status: UserStatus): Observable<User> {
    return this.http.patch<User>(`${this.base}/${id}/status`, { status }).pipe(
      tap((user) => this.usersSignal.update((list) => upsertById(list, user))),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  /** PATCH /users/me/password */
  changeMyPassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http
      .patch<void>(`${this.base}/me/password`, { currentPassword, newPassword })
      .pipe(catchError((err) => throwError(() => new Error(apiErrorMessage(err)))));
  }

  /** POST /users/{id}/reset-password — ตั้งรหัสชั่วคราวโดยผู้มีสิทธิ์ user.reset_password */
  resetPassword(id: number, newPassword: string): Observable<void> {
    return this.http
      .post<void>(`${this.base}/${id}/reset-password`, { newPassword })
      .pipe(catchError((err) => throwError(() => new Error(apiErrorMessage(err)))));
  }

  /** เหลือไว้ให้ roles-page เรียก — backend ถอดบทบาทเองตอนลบ role */
  detachRole(_roleId: number): void {
    /* no-op: sync จาก API ผ่าน list() หลังลบบทบาท */
  }
}
