import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, delay, of, throwError } from 'rxjs';
import {
  AppNotification,
  NotificationChannel,
  NotificationRule,
  NotificationTrigger,
} from '../models/notification.model';
import { AuditService } from './audit.service';

const RULES_KEY = 'cpams_mock_notification_rules';
const ITEMS_KEY = 'cpams_mock_notifications';

const SEED_RULES: NotificationRule[] = [
  {
    id: 1,
    code: 'WARRANTY_30D',
    name: 'ประกันใกล้หมดอายุ 30 วัน',
    trigger: 'WARRANTY_EXPIRY',
    channel: 'IN_APP',
    daysBefore: 30,
    enabled: true,
    description: 'แจ้งเมื่อรายการประกัน ACTIVE เหลือไม่เกิน 30 วัน',
  },
  {
    id: 2,
    code: 'MA_QUOTA_2',
    name: 'โควตา MA เหลือไม่เกิน 2',
    trigger: 'MA_QUOTA_LOW',
    channel: 'IN_APP',
    daysBefore: 0,
    enabled: true,
    description: 'แจ้งเมื่อสัญญา ACTIVE เหลือโควตา ≤ 2 เคส',
  },
  {
    id: 3,
    code: 'FOLLOWUP_OVERDUE',
    name: 'ติดตามเลยกำหนด',
    trigger: 'FOLLOW_UP_OVERDUE',
    channel: 'LINE_MOCK',
    daysBefore: 0,
    enabled: true,
    description: 'แจ้งผู้รับผิดชอบเมื่อแผนติดตามเลยวันครบกำหนด (LINE mock)',
  },
  {
    id: 4,
    code: 'TICKET_REOPEN',
    name: 'ปัญหาเดิมกลับมา',
    trigger: 'TICKET_REOPENED',
    channel: 'IN_APP',
    daysBefore: 0,
    enabled: false,
    description: 'ปิดไว้ก่อน — เปิดเมื่อต้องการแจ้งหัวหน้าซัพพอร์ต',
  },
];

const SEED_ITEMS: AppNotification[] = [
  {
    id: 1,
    userId: 1,
    title: 'ประกันใกล้หมดอายุ',
    body: 'ประกัน Gateway / เซ็นเซอร์ชุดติดตั้ง ของ แสงตะวัน ใกล้หมดอายุ',
    trigger: 'WARRANTY_EXPIRY',
    link: '/app/warranties',
    createdAt: '2026-09-06T08:00:00.000Z',
    readAt: null,
  },
  {
    id: 2,
    userId: 1,
    title: 'โควตา MA ใกล้หมด',
    body: 'สัญญา MA-2026-002 เหลือโควตาต่ำ — ควรเสนอ Add-on',
    trigger: 'MA_QUOTA_LOW',
    link: '/app/ma/2',
    createdAt: '2026-09-05T10:00:00.000Z',
    readAt: null,
  },
  {
    id: 3,
    userId: 4,
    title: 'ติดตามเลยกำหนด',
    body: 'แผน “ติดตามต่อสัญญา MA ประจำปี” เลยวันครบกำหนดแล้ว',
    trigger: 'FOLLOW_UP_OVERDUE',
    link: '/app/follow-ups',
    createdAt: '2026-09-06T09:00:00.000Z',
    readAt: null,
  },
  {
    id: 4,
    userId: 1,
    title: 'สรุปรายวัน (mock)',
    body: 'มีงานติดตามค้าง 1 รายการ และประกันใกล้หมดอายุ 2 รายการ',
    trigger: 'MANUAL',
    link: '/app/dashboard',
    createdAt: '2026-09-04T07:30:00.000Z',
    readAt: '2026-09-04T08:00:00.000Z',
  },
];

export interface NotificationRuleInput {
  name: string;
  trigger: NotificationTrigger;
  channel: NotificationChannel;
  daysBefore: number;
  enabled: boolean;
  description: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly audit = inject(AuditService);
  private readonly rulesSignal = signal<NotificationRule[]>(this.load(RULES_KEY, SEED_RULES));
  private readonly itemsSignal = signal<AppNotification[]>(this.load(ITEMS_KEY, SEED_ITEMS));
  private nextItemId = this.maxId(this.itemsSignal()) + 1;

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

  /** Super Admin/Admin: ดูทั้งหมด */
  listAll(): Observable<AppNotification[]> {
    const list = [...this.itemsSignal()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return of(structuredClone(list)).pipe(delay(180));
  }

  updateRule(id: number, input: NotificationRuleInput, actorName = 'ระบบ'): Observable<NotificationRule> {
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
    };
    this.rulesSignal.update((list) => {
      const next = list.map((r) => (r.id === id ? updated : r));
      this.save(RULES_KEY, next);
      return next;
    });
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
    this.itemsSignal.update((list) => {
      const next = list.map((n) => (n.id === id ? updated : n));
      this.save(ITEMS_KEY, next);
      return next;
    });
    return of(structuredClone(updated)).pipe(delay(120));
  }

  markAllRead(userId: number): Observable<number> {
    let count = 0;
    this.itemsSignal.update((list) => {
      const next = list.map((n) => {
        if (n.userId === userId && !n.readAt) {
          count += 1;
          return { ...n, readAt: new Date().toISOString() };
        }
        return n;
      });
      this.save(ITEMS_KEY, next);
      return next;
    });
    return of(count).pipe(delay(150));
  }

  /** สร้างแจ้งเตือนจำลอง (เช่น กด “สร้างตัวอย่าง”) */
  pushMock(
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
    this.itemsSignal.update((list) => {
      const next = [row, ...list];
      this.save(ITEMS_KEY, next);
      return next;
    });
    return of(structuredClone(row)).pipe(delay(150));
  }

  private load<T>(key: string, seed: T[]): T[] {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        return JSON.parse(raw) as T[];
      }
    } catch {
      /* ignore */
    }
    const data = structuredClone(seed);
    this.save(key, data);
    return data;
  }

  private save<T>(key: string, data: T[]): void {
    localStorage.setItem(key, JSON.stringify(data));
  }

  private maxId(items: { id: number }[]): number {
    return items.reduce((max, i) => Math.max(max, i.id), 0);
  }
}
