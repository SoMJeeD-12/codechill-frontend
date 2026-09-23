import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { apiErrorMessage } from '../http/api-error';
import { asPage, toHttpParams } from '../http/api.util';
import {
  AppNotification,
  NotificationListParams,
  NotificationListResult,
} from '../models/notification.model';

/**
 * Inbox การแจ้งเตือนพนักงาน — /api/notifications
 * ค่าเริ่มต้น = ของตัวเอง · ห้ามส่ง all=true โดยไม่มี notification.manage
 * ไม่มี UI ส่งหาลูกค้า (BR-11)
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/notifications`;

  list(params: NotificationListParams = {}): Observable<NotificationListResult> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    return this.http
      .get<AppNotification[] | NotificationListResult>(this.base, {
        params: toHttpParams({
          page,
          limit,
          status: params.status,
          // หน้า inbox ไม่ส่ง all — ค่าเริ่มต้นของ API คือของตัวเอง
          all: params.all === true ? true : undefined,
        }),
      })
      .pipe(
        map((body) => {
          const pageBody = asPage<AppNotification>(body);
          const raw =
            body && !Array.isArray(body)
              ? (body as NotificationListResult)
              : null;
          return {
            items: pageBody.items.map((row) => this.normalize(row)),
            total: pageBody.total,
            page: Number(raw?.page) || page,
            limit: Number(raw?.limit) || limit,
          };
        }),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  getById(id: number): Observable<AppNotification> {
    return this.http.get<AppNotification>(`${this.base}/${id}`).pipe(
      map((row) => this.normalize(row)),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  /** PATCH /notifications/:id/read — body ว่าง */
  markRead(id: number): Observable<AppNotification> {
    return this.http.patch<AppNotification>(`${this.base}/${id}/read`, {}).pipe(
      map((row) => this.normalize(row)),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  private normalize(row: AppNotification | null | undefined): AppNotification {
    return {
      id: Number(row?.id) || 0,
      targetUserId: Number(row?.targetUserId) || 0,
      eventType: row?.eventType ?? '',
      title: row?.title?.trim() || '—',
      message: row?.message ?? null,
      refType: row?.refType ?? null,
      refId: row?.refId == null ? null : Number(row.refId) || null,
      status: (row?.status as AppNotification['status']) || 'PENDING',
      scheduledAt: row?.scheduledAt ?? null,
      sentAt: row?.sentAt ?? null,
      readAt: row?.readAt ?? null,
      errorMessage: row?.errorMessage ?? null,
      createdAt: row?.createdAt ?? '',
    };
  }
}
