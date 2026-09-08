import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { apiErrorMessage } from '../http/api-error';
import { asList, pruneUndefined, toHttpParams, upsertById } from '../http/api.util';
import { AccountType, User, UserStatus } from '../models/user.model';

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

  readonly users = this.usersSignal.asReadonly();
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

  getById(id: number): User | undefined {
    return this.usersSignal().find((u) => u.id === id);
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

  /** เหลือไว้ให้ roles-page เรียก — backend ถอดบทบาทเองตอนลบ role */
  detachRole(_roleId: number): void {
    /* no-op: sync จาก API ผ่าน list() หลังลบบทบาท */
  }
}
