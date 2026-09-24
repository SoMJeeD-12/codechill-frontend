import { Injectable, inject, signal } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { MenuCode } from '../models/permission.model';
import { isNotificationUnread } from '../models/notification.model';
import { AuthService } from './auth.service';
import { NotificationService } from './notification.service';
import { ProjectService } from './project.service';
import { TicketService } from './ticket.service';

/** คีย์ชั่วคราวรวมเข้า ticket-admin-queue */
type BadgeKey = MenuCode | 'admin-claim' | 'admin-review';
type BadgeRow = { code: BadgeKey; n: number };

/**
 * จำนวนบนเมนู sidebar — จุดแดงเมื่อมีของ「ส่งกลับ / รอทำ」
 * คิวซัพพอร์ต RETURNED = แอดมินส่งกลับมา (ชัดที่สุด)
 */
@Injectable({ providedIn: 'root' })
export class NavAttentionService {
  private readonly auth = inject(AuthService);
  private readonly tickets = inject(TicketService);
  private readonly projects = inject(ProjectService);
  private readonly notifications = inject(NotificationService);

  private readonly countsSignal = signal<Partial<Record<MenuCode, number>>>({});
  private refreshing = false;

  readonly counts = this.countsSignal.asReadonly();

  badge(code: MenuCode): number {
    return this.countsSignal()[code] ?? 0;
  }

  refresh(): void {
    if (this.refreshing) {
      return;
    }
    this.auth.session();
    if (!this.auth.isAuthenticated()) {
      this.countsSignal.set({});
      return;
    }

    this.refreshing = true;
    const jobs: Observable<BadgeRow>[] = [];

    if (this.auth.canAccessTicketSupportQueue()) {
      jobs.push(
        this.tickets.listSupportQueue({ tab: 'RETURNED', page: 1, limit: 1 }).pipe(
          map((body) => ({ code: 'ticket-workflow' as const, n: body.total })),
          catchError(() => of({ code: 'ticket-workflow' as const, n: 0 }))
        )
      );
    }

    if (this.auth.canAccessTicketAdminQueue()) {
      jobs.push(
        this.tickets.listAdminQueue({ tab: 'AWAITING_CLAIM', page: 1, limit: 1 }).pipe(
          map((body) => ({ code: 'admin-claim' as const, n: body.total })),
          catchError(() => of({ code: 'admin-claim' as const, n: 0 }))
        ),
        this.tickets.listAdminQueue({ tab: 'AWAITING_REVIEW', page: 1, limit: 1 }).pipe(
          map((body) => ({ code: 'admin-review' as const, n: body.total })),
          catchError(() => of({ code: 'admin-review' as const, n: 0 }))
        )
      );
    }

    if (this.auth.canAccessTaskReviewQueue()) {
      jobs.push(
        this.projects.listAllTasks({ page: 1, limit: 100, status: 'REVIEW' }).pipe(
          map((rows) => ({ code: 'tasks-review' as const, n: rows.length })),
          catchError(() => of({ code: 'tasks-review' as const, n: 0 }))
        )
      );
    }

    if (this.auth.hasPermissionCode('task.view')) {
      jobs.push(
        this.projects.listMyTasks({ limit: 100 }).pipe(
          map((rows) => {
            const n = rows.filter(
              (t) =>
                (t.status === 'DOING' || t.status === 'WAITING') &&
                (t.submissions ?? []).some((s) => String(s.status).toUpperCase() === 'REJECTED')
            ).length;
            return { code: 'tasks-me' as const, n };
          }),
          catchError(() => of({ code: 'tasks-me' as const, n: 0 }))
        )
      );
    }

    if (this.auth.hasPermissionCode('notification.view')) {
      jobs.push(
        this.notifications.list({ page: 1, limit: 50 }).pipe(
          map((body) => ({
            code: 'notifications' as const,
            n: body.items.filter((row) => isNotificationUnread(row)).length,
          })),
          catchError(() => of({ code: 'notifications' as const, n: 0 }))
        )
      );
    }

    if (!jobs.length) {
      this.countsSignal.set({});
      this.refreshing = false;
      return;
    }

    forkJoin(jobs).subscribe({
      next: (rows) => {
        const next: Partial<Record<MenuCode, number>> = {};
        let adminSum = 0;
        for (const row of rows) {
          if (row.code === 'admin-claim' || row.code === 'admin-review') {
            adminSum += row.n;
            continue;
          }
          if (row.n > 0) {
            next[row.code] = row.n;
          }
        }
        if (adminSum > 0) {
          next['ticket-admin-queue'] = adminSum;
        }
        this.countsSignal.set(next);
        this.refreshing = false;
      },
      error: () => {
        this.refreshing = false;
      },
    });
  }
}
