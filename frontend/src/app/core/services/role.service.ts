import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { apiErrorMessage } from '../http/api-error';
import { asList, pruneUndefined, toHttpParams, upsertById } from '../http/api.util';
import { PermissionGroup, Role } from '../models/permission.model';
import { RoleSummary } from '../models/user.model';

/** CreateRoleDto */
export interface CreateRoleInput {
  name: string;
  description?: string;
  isActive?: boolean;
  permissionIds?: number[];
}

/** UpdateRoleDto */
export interface UpdateRoleInput {
  name?: string;
  description?: string;
  isActive?: boolean;
  permissionIds?: number[];
}

export interface RoleListParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  isActive?: boolean;
}

@Injectable({ providedIn: 'root' })
export class RoleService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/roles`;
  private readonly permissionsBase = `${environment.apiBaseUrl}/permissions`;

  private readonly rolesSignal = signal<Role[]>([]);
  private readonly permissionGroupsSignal = signal<PermissionGroup[]>([]);

  readonly roles = this.rolesSignal.asReadonly();
  readonly permissionGroups = this.permissionGroupsSignal.asReadonly();
  readonly roleCount = computed(() => this.rolesSignal().length);

  list(params?: RoleListParams): Observable<Role[]> {
    return this.http
      .get<Role[] | { items: Role[] }>(this.base, { params: toHttpParams({ ...params }) })
      .pipe(
        map(asList),
        tap((list) => this.rolesSignal.set(list)),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  /**
   * GET /roles/assignable — ดรอปดาวน์มอบบทบาทให้ผู้ใช้ (สิทธิ์ user.update)
   * คนละเส้นกับ GET /roles ของหน้าจัดการบทบาท (SUPER_ADMIN)
   */
  listAssignable(): Observable<RoleSummary[]> {
    return this.http.get<RoleSummary[]>(`${this.base}/assignable`).pipe(
      map((rows) => (Array.isArray(rows) ? rows : [])),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  getById(id: number): Role | undefined {
    return this.rolesSignal().find((r) => r.id === id);
  }

  /** GET /permissions — แคตตาล็อกสิทธิ์จัดกลุ่มตาม module */
  listPermissions(): Observable<PermissionGroup[]> {
    return this.http
      .get<PermissionGroup[] | { items: PermissionGroup[] }>(this.permissionsBase)
      .pipe(
        map(asList),
        tap((groups) => this.permissionGroupsSignal.set(groups)),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  create(input: CreateRoleInput): Observable<Role> {
    return this.http.post<Role>(this.base, pruneUndefined(input)).pipe(
      tap((role) => this.rolesSignal.update((list) => upsertById(list, role))),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  update(id: number, input: UpdateRoleInput): Observable<Role> {
    return this.http.put<Role>(`${this.base}/${id}`, pruneUndefined(input)).pipe(
      tap((role) => this.rolesSignal.update((list) => upsertById(list, role))),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  /** PUT /roles/{id}/permissions — SetRolePermissionsDto */
  setPermissions(id: number, permissionIds: number[]): Observable<Role> {
    return this.http.put<Role>(`${this.base}/${id}/permissions`, { permissionIds }).pipe(
      tap((role) => this.rolesSignal.update((list) => upsertById(list, role))),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`).pipe(
      tap(() => this.rolesSignal.update((list) => list.filter((r) => r.id !== id))),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }
}
