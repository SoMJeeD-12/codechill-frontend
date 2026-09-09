import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, delay, of, throwError } from 'rxjs';
import {
  MOCK_NOTIFICATION_RULES,
  buildMockNotifications,
} from '../mock/notification.mock';
import {
  AppNotification,
  NotificationChannel,
  NotificationRule,
  NotificationTrigger,
} from '../models/notification.model';
import { AuditService } from './audit.service';

export interface NotificationRuleInput {
  name: string;
  trigger: NotificationTrigger;
  channel: NotificationChannel;
  daysBefore: number;
  enabled: boolean;
  description: string;
}

/**
 * Notifications M11 — mock ในแอป + กติกา
 * LINE จริงยังไม่ต่อ (ใช้ LINE_MOCK)
 * เส้นทางที่คาดไว้: /api/notifications , /api/notification-rules
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly audit = inject(AuditService);
  private readonly rulesSignal = signal<NotificationRule[]>(
    structuredClone(MOCK_NOTIFICATION_RULES)
  );
  private readonly itemsSignal = signal<AppNotification[]>([]);
  private nextItemId = 1;
  private demoSeededForUser = new Set<number>();

  readonly rules = this.rulesSignal.asReadonly();
  readonly notifications = this.itemsSignal.asReadonly();

  unreadCountFor(userId: number): number {
    return this.itemsSignal().filter((n) => n.userId === userId && !n.readAt).length;
  }

  readonly unreadTotal = computed(() => this.itemsSignal().filter((n) => !n.readAt).length);

  listRules(): Observable<NotificationRule[]> {
    return of(structuredClone(this.rulesSignal())).pipe(delay(150));
  }

  listForUser(userId: number): Observable<AppNotification[]> {
    const list = this.itemsSignal()
      .filter((n) => n.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return of(structuredClone(list)).pipe(delay(180));
  }

  listAll(): Observable<AppNotification[]> {
    const list = [...this.itemsSignal()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return of(structuredClone(list)).pipe(delay(180));
  }

  updateRule(
    id: number,
    input: NotificationRuleInput,
    actorName = 'ระบบ'
  ): Observable<NotificationRule> {
    const current = this.rulesSignal().find((r) => r.id === id);
    if (!current) {
      return throwError(() => new Error('ไม่พบกติกาแจ้งเตือน'));
    }
    const updated: NotificationRule = {
      ...current,
      name: input.name.trim(),
      trigger: input.trigger,
      channel: input.channel,
      daysBefore: Math.max(0, Number(input.daysBefore) || 0),
      enabled: input.enabled,
      description: input.description.trim(),
      updatedAt: new Date().toISOString(),
    };
    this.rulesSignal.update((list) => list.map((r) => (r.id === id ? updated : r)));
    this.audit.log({
      actorUserId: null,
      actorName,
      action: 'UPDATE',
      entityType: 'notification',
      entityId: id,
      summary: `อัปเดตกติกา: ${updated.name} (${updated.enabled ? 'เปิด' : 'ปิด'})`,
    });
    return of(structuredClone(updated)).pipe(delay(180));
  }

  toggleRule(id: number, actorName = 'ระบบ'): Observable<NotificationRule> {
    const current = this.rulesSignal().find((r) => r.id === id);
    if (!current) {
      return throwError(() => new Error('ไม่พบกติกาแจ้งเตือน'));
    }
    return this.updateRule(
      id,
      {
        name: current.name,
        trigger: current.trigger,
        channel: current.channel,
        daysBefore: current.daysBefore,
        enabled: !current.enabled,
        description: current.description,
      },
      actorName
    );
  }

  markRead(id: number): Observable<AppNotification> {
    const current = this.itemsSignal().find((n) => n.id === id);
    if (!current) {
      return throwError(() => new Error('ไม่พบการแจ้งเตือน'));
    }
    const updated: AppNotification = {
      ...current,
      readAt: current.readAt ?? new Date().toISOString(),
    };
    this.itemsSignal.update((list) => list.map((n) => (n.id === id ? updated : n)));
    return of(structuredClone(updated)).pipe(delay(120));
  }

  markAllRead(userId: number): Observable<number> {
    let count = 0;
    this.itemsSignal.update((list) =>
      list.map((n) => {
        if (n.userId === userId && !n.readAt) {
          count += 1;
          return { ...n, readAt: new Date().toISOString() };
        }
        return n;
      })
    );
    return of(count).pipe(delay(150));
  }

  pushSample(
    userId: number,
    title: string,
    body: string,
    trigger: NotificationTrigger = 'MANUAL',
    link: string | null = null
  ): Observable<AppNotification> {
    const row: AppNotification = {
      id: this.nextItemId++,
      userId,
      title,
      body,
      trigger,
      link,
      createdAt: new Date().toISOString(),
      readAt: null,
    };
    this.itemsSignal.update((list) => [row, ...list]);
    return of(structuredClone(row)).pipe(delay(150));
  }

  /** เติม inbox ตัวอย่างต่อผู้ใช้ (ไม่ทับรายการที่มีอยู่) */
  ensureDemoSeed(userId: number): Observable<AppNotification[]> {
    if (!userId || this.demoSeededForUser.has(userId)) {
      return this.listForUser(userId);
    }
    const hasForUser = this.itemsSignal().some((n) => n.userId === userId);
    if (hasForUser) {
      this.demoSeededForUser.add(userId);
      return this.listForUser(userId);
    }
    const rows = buildMockNotifications(userId);
    this.itemsSignal.update((list) => [...rows, ...list]);
    const maxId = Math.max(0, ...this.itemsSignal().map((n) => n.id));
    this.nextItemId = maxId + 1;
    this.demoSeededForUser.add(userId);
    return of(structuredClone(rows)).pipe(delay(120));
  }
}
