import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { apiErrorMessage } from '../http/api-error';
import { asList, toHttpParams } from '../http/api.util';
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

  /** client-side log เลิกใช้แล้ว — backend บันทึกเอง; คง method ไว้ไม่ให้เรียกพัง */
  log(_input: unknown): null {
    return null;
  }
}
