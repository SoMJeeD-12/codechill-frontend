import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { apiErrorMessage } from '../http/api-error';
import {
  CursorPage,
  Paginated,
  asCursorPage,
  asList,
  asPage,
  toHttpParams,
} from '../http/api.util';
import { AuditAction, AuditLog } from '../models/audit.model';

export interface AuditListParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  userId?: number;
  tableName?: string;
  recordId?: number;
  action?: AuditAction;
  dateFrom?: string;
  dateTo?: string;
  /** ซ่อนเข้าสู่ระบบ / ต่ออายุ / ออกจากระบบ */
  hideSessionEvents?: boolean;
  /** ซ่อนงานอัตโนมัติของระบบ (user = null) — ไม่มีผลเมื่อส่ง userId */
  hideSystemEvents?: boolean;
  /** คั่นหลายตารางด้วย , */
  excludeTableNames?: string;
}

@Injectable({ providedIn: 'root' })
export class AuditService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/audit-logs`;
  private readonly items = signal<AuditLog[]>([]);

  readonly logs = this.items.asReadonly();

  list(params?: AuditListParams): Observable<AuditLog[]> {
    return this.http
      .get<AuditLog[] | { items: AuditLog[] }>(this.base, {
        params: toHttpParams({ ...params }),
      })
      .pipe(
        map(asList),
        tap((list) => this.items.set(list)),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  /** GET /audit-logs แบบแบ่งหน้า — ใช้ total จาก API */
  listPage(params: AuditListParams): Observable<{ items: AuditLog[]; total: number }> {
    return this.http
      .get<AuditLog[] | Paginated<AuditLog>>(this.base, {
        params: toHttpParams({ ...params }),
      })
      .pipe(
        map((body) => asPage(body)),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  /**
   * GET /audit-logs แบบ cursor — ใช้ได้เฉพาะเรียงใหม่สุดก่อน (ไม่ส่ง sortBy/page)
   * หน้าแรก cursor = null · หน้าถัดไปส่งตัวกรองเดิมทั้งหมด + cursor
   */
  listCursor(
    params: Omit<AuditListParams, 'page' | 'sortBy' | 'sortOrder'>,
    cursor: string | null
  ): Observable<CursorPage<AuditLog>> {
    return this.http
      .get<AuditLog[] | Paginated<AuditLog>>(this.base, {
        params: toHttpParams({ ...params, cursor }),
      })
      .pipe(
        map((body) => asCursorPage<AuditLog>(body)),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  /** client-side log เลิกใช้แล้ว — backend บันทึกเอง; คง method ไว้ไม่ให้เรียกพัง */
  log(_input: unknown): null {
    return null;
  }
}
