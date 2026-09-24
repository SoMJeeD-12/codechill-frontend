import { Injectable, Injector, inject, signal } from '@angular/core';
import { AppNotification } from '../../core/models/notification.model';

export type InboxToastTone = 'admin' | 'review' | 'support' | 'default';

export interface InboxToastItem {
  uid: number;
  notification: AppNotification;
  tone: InboxToastTone;
}

const MAX_VISIBLE = 2;
const AUTO_MS = 7000;

/**
 * Toast ชนิด B — การ์ดแจ้งเตือนใหม่จาก inbox (C-3)
 * แยกจาก ApiToastService (ชนิด A) โดยสิ้นเชิง
 */
@Injectable({ providedIn: 'root' })
export class InboxToastService {
  /** lazy — กัน circular DI กับ NotificationInboxService */
  private readonly injector = inject(Injector);
  private seq = 0;
  private readonly timers = new Map<number, number>();
  private readonly remaining = new Map<number, number>();
  private readonly startedAt = new Map<number, number>();

  readonly items = signal<InboxToastItem[]>([]);

  show(notification: AppNotification): void {
    const uid = ++this.seq;
    const item: InboxToastItem = {
      uid,
      notification,
      tone: this.toneFor(notification.eventType),
    };
    this.items.update((list) => [item, ...list].slice(0, MAX_VISIBLE));
    this.armTimer(uid, AUTO_MS);
  }

  showMany(rows: AppNotification[]): void {
    const newest = [...rows].sort((a, b) => b.id - a.id).slice(0, MAX_VISIBLE);
    for (const row of newest.reverse()) {
      this.show(row);
    }
  }

  dismiss(uid: number): void {
    this.clearTimer(uid);
    this.items.update((list) => list.filter((t) => t.uid !== uid));
  }

  dismissAll(): void {
    for (const uid of [...this.timers.keys()]) {
      this.clearTimer(uid);
    }
    this.items.set([]);
  }

  pause(uid: number): void {
    const handle = this.timers.get(uid);
    if (handle == null) {
      return;
    }
    window.clearTimeout(handle);
    this.timers.delete(uid);
    const started = this.startedAt.get(uid) ?? Date.now();
    const total = this.remaining.get(uid) ?? AUTO_MS;
    const left = Math.max(800, total - (Date.now() - started));
    this.remaining.set(uid, left);
  }

  resume(uid: number): void {
    if (this.timers.has(uid)) {
      return;
    }
    if (!this.items().some((t) => t.uid === uid)) {
      return;
    }
    const left = this.remaining.get(uid) ?? AUTO_MS;
    this.armTimer(uid, left);
  }

  open(uid: number): void {
    const item = this.items().find((t) => t.uid === uid);
    if (!item) {
      return;
    }
    this.dismiss(uid);
    // dynamic import — หลีกเลี่ยง circular DI
    void import('../../core/services/notification-inbox.service').then((m) => {
      this.injector.get(m.NotificationInboxService).openNotification(item.notification);
    });
  }

  private armTimer(uid: number, ms: number): void {
    this.remaining.set(uid, ms);
    this.startedAt.set(uid, Date.now());
    const handle = window.setTimeout(() => this.dismiss(uid), ms);
    this.timers.set(uid, handle);
  }

  private clearTimer(uid: number): void {
    const handle = this.timers.get(uid);
    if (handle != null) {
      window.clearTimeout(handle);
      this.timers.delete(uid);
    }
    this.remaining.delete(uid);
    this.startedAt.delete(uid);
  }

  private toneFor(eventType: string): InboxToastTone {
    const key = String(eventType ?? '').toUpperCase();
    if (key === 'TICKET_SENT_TO_ADMIN') {
      return 'admin';
    }
    if (key === 'TICKET_AWAITING_REVIEW') {
      return 'review';
    }
    if (key === 'TICKET_RETURNED_TO_SUPPORT') {
      return 'support';
    }
    return 'default';
  }
}
