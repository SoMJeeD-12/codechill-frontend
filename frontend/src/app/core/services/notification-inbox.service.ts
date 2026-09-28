import { Injectable, Injector, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, finalize, tap } from 'rxjs';
import {
  AppNotification,
  isNotificationUnread,
  notificationNavTarget,
} from '../models/notification.model';
import { AuthService } from './auth.service';
import { NotificationService } from './notification.service';
import { NavAttentionService } from './nav-attention.service';
import { InboxToastService } from '../../shared/toasts/inbox-toast.service';

const RECENT_LIMIT = 8;

/**
 * Inbox แจ้งเตือน (ไม่มี WS/SSE) — badge กระดิ่ง + การ์ดชนิด B เมื่อมีของใหม่
 * รอบเวลา/visibility อยู่ที่ NavAttentionService.refreshBadges() ที่เดียว
 * รอบแรกหลัง start = baseline อย่างเดียว ไม่ toast ของเก่า
 */
@Injectable({ providedIn: 'root' })
export class NotificationInboxService {
  private readonly api = inject(NotificationService);
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);
  private readonly inboxToasts = inject(InboxToastService);
  private readonly router = inject(Router);

  private running = false;
  private polling = false;
  private pendingPoll = false;
  private pendingQuiet = true;
  private baselineDone = false;
  private lastSeenId = 0;
  private ringClearId: number | null = null;

  readonly unreadCount = signal(0);
  readonly recentItems = signal<AppNotification[]>([]);
  /** กระดิ่งสั่น/กระพริบเมื่อมีของใหม่ */
  readonly ringing = signal(false);

  start(): void {
    if (this.running) {
      return;
    }
    this.auth.session();
    if (!this.auth.isAuthenticated() || !this.auth.hasPermissionCode('notification.view')) {
      return;
    }
    this.running = true;
    this.baselineDone = false;
    this.lastSeenId = 0;
    this.poll();
  }

  stop(): void {
    this.running = false;
    this.polling = false;
    this.pendingPoll = false;
    this.baselineDone = false;
    if (this.ringClearId != null) {
      window.clearTimeout(this.ringClearId);
      this.ringClearId = null;
    }
    this.inboxToasts.dismissAll();
    this.unreadCount.set(0);
    this.recentItems.set([]);
    this.ringing.set(false);
  }

  /** เรียกหลัง mark read / เปิดเมนู — ไม่ toast */
  refreshQuiet(): void {
    this.clearRing();
    this.poll({ quiet: true });
  }

  clearRing(): void {
    if (this.ringClearId != null) {
      window.clearTimeout(this.ringClearId);
      this.ringClearId = null;
    }
    this.ringing.set(false);
  }

  /** เปิดหน้ารายละเอียดใบ → อ่านแจ้งเตือนของใบนั้นแบบเงียบ ไม่แสดง error */
  markReadByRef(refType: string, refId: number): void {
    if (!this.auth.hasPermissionCode('notification.view')) {
      return;
    }
    this.api.markReadByRef(refType, refId).subscribe({
      next: ({ updated }) => {
        if (updated <= 0) {
          return;
        }
        const now = new Date().toISOString();
        const type = refType.toUpperCase();
        let cleared = 0;
        this.recentItems.update((list) =>
          list.map((n) => {
            if (
              isNotificationUnread(n) &&
              n.refId === refId &&
              String(n.refType ?? '').toUpperCase() === type
            ) {
              cleared++;
              return { ...n, status: 'READ' as const, readAt: now };
            }
            return n;
          })
        );
        this.unreadCount.update((n) => Math.max(0, n - Math.max(cleared, updated)));
      },
      error: () => undefined,
    });
  }

  /** ปุ่ม「อ่านทั้งหมด」ในกระดิ่ง */
  markAllRead(): Observable<{ updated: number }> {
    return this.api.markAllRead().pipe(
      tap(() => {
        const now = new Date().toISOString();
        this.recentItems.update((list) =>
          list.map((n) =>
            isNotificationUnread(n) ? { ...n, status: 'READ' as const, readAt: now } : n
          )
        );
        this.unreadCount.set(0);
      })
    );
  }

  openNotification(row: AppNotification): void {
    const go = () => {
      const target = notificationNavTarget(row, {
        canAdminQueue: this.auth.canAccessTicketAdminQueue(),
        canSupportQueue: this.auth.canAccessTicketSupportQueue(),
      });
      if (target) {
        void this.router.navigate(target.commands, {
          queryParams: target.queryParams,
        });
      } else {
        void this.router.navigate(['/app/notifications']);
      }
    };

    if (!isNotificationUnread(row)) {
      go();
      return;
    }
    this.api.markRead(row.id).subscribe({
      next: (updated) => {
        this.recentItems.update((list) =>
          list.map((n) => (n.id === updated.id ? updated : n))
        );
        this.unreadCount.update((n) => Math.max(0, n - 1));
        go();
      },
      error: () => go(),
    });
  }

  /** เรียกจาก NavAttentionService.refreshBadges() — ซ้อนกันจะรวมเป็นรอบถัดไปรอบเดียว */
  poll(opts: { quiet?: boolean } = {}): void {
    if (!this.running) {
      return;
    }
    if (this.polling) {
      this.pendingPoll = true;
      this.pendingQuiet = this.pendingQuiet && !!opts.quiet;
      return;
    }
    this.auth.session();
    if (!this.auth.isAuthenticated() || !this.auth.hasPermissionCode('notification.view')) {
      this.stop();
      return;
    }

    this.polling = true;
    this.api.list({ page: 1, limit: 20 }).pipe(finalize(() => this.finishPoll())).subscribe({
      next: (body) => {
        const items = body.items ?? [];
        const unread = items.filter((row) => isNotificationUnread(row)).length;
        this.unreadCount.set(unread);
        const ranked = [...items].sort((a, b) => {
          const au = isNotificationUnread(a) ? 0 : 1;
          const bu = isNotificationUnread(b) ? 0 : 1;
          if (au !== bu) {
            return au - bu;
          }
          return b.id - a.id;
        });
        this.recentItems.set(ranked.slice(0, RECENT_LIMIT));

        const maxId = items.reduce((m, row) => Math.max(m, row.id), 0);

        if (!this.baselineDone) {
          this.lastSeenId = maxId;
          this.baselineDone = true;
          return;
        }

        if (opts.quiet) {
          this.lastSeenId = Math.max(this.lastSeenId, maxId);
          return;
        }

        const fresh = items.filter((row) => row.id > this.lastSeenId);
        this.lastSeenId = Math.max(this.lastSeenId, maxId);

        if (fresh.length) {
          this.ringBell();
          this.inboxToasts.showMany(fresh);
          // แจ้งเตือนใหม่มักมาพร้อมใบเข้าคิว — ให้เลขคิวตามทัน
          this.injector.get(NavAttentionService).refreshBadges();
        }
      },
      error: () => undefined,
    });
  }

  private finishPoll(): void {
    this.polling = false;
    if (this.pendingPoll) {
      const quiet = this.pendingQuiet;
      this.pendingPoll = false;
      this.pendingQuiet = true;
      this.poll({ quiet });
    }
  }

  private ringBell(): void {
    this.ringing.set(false);
    window.setTimeout(() => {
      this.ringing.set(true);
      if (this.ringClearId != null) {
        window.clearTimeout(this.ringClearId);
      }
      this.ringClearId = window.setTimeout(() => {
        this.ringing.set(false);
        this.ringClearId = null;
      }, 2800);
    }, 20);
  }
}
