import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, delay, of, throwError } from 'rxjs';
import { buildMockFollowUps } from '../mock/follow-up.mock';
import {
  FollowUp,
  FollowUpChannel,
  FollowUpStatus,
} from '../models/follow-up.model';
import { parseDateOnly, toDateOnlyString } from '../utils/date.util';
import { AuditService } from './audit.service';

export interface FollowUpInput {
  customerId: number;
  title: string;
  dueDate: string;
  assigneeId?: number | null;
  channel: FollowUpChannel;
  status: FollowUpStatus;
  note?: string | null;
}

export interface FollowUpListParams {
  customerId?: number;
  assigneeId?: number;
  status?: FollowUpStatus;
  overdueOnly?: boolean;
  search?: string;
}

/**
 * Follow-ups M7 — mock จนกว่า backend จะปล่อย /api/follow-ups
 */
@Injectable({ providedIn: 'root' })
export class FollowUpService {
  private readonly audit = inject(AuditService);
  private readonly items = signal<FollowUp[]>([]);
  private nextId = 1;
  private demoSeeded = false;

  readonly followUps = this.items.asReadonly();
  readonly overdueCount = computed(() => this.listOverdue().length);

  list(params: FollowUpListParams = {}): Observable<FollowUp[]> {
    let rows = this.items();
    if (params.customerId != null) {
      rows = rows.filter((f) => f.customerId === params.customerId);
    }
    if (params.assigneeId != null) {
      rows = rows.filter((f) => f.assigneeId === params.assigneeId);
    }
    if (params.status) {
      rows = rows.filter((f) => f.status === params.status);
    }
    if (params.overdueOnly) {
      rows = rows.filter((f) => this.isOverdue(f));
    }
    if (params.search?.trim()) {
      const q = params.search.trim().toLowerCase();
      rows = rows.filter(
        (f) =>
          f.title.toLowerCase().includes(q) ||
          (f.note ?? '').toLowerCase().includes(q)
      );
    }
    return of(structuredClone(rows)).pipe(delay(180));
  }

  getById(id: number): FollowUp | undefined {
    return this.items().find((f) => f.id === id);
  }

  get(id: number): Observable<FollowUp> {
    const row = this.getById(id);
    if (!row) {
      return throwError(() => new Error('ไม่พบแผนติดตาม'));
    }
    return of(structuredClone(row)).pipe(delay(100));
  }

  getByCustomer(customerId: number): FollowUp[] {
    return this.items()
      .filter((f) => f.customerId === customerId)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }

  isOverdue(f: FollowUp): boolean {
    if (f.status !== 'PLANNED') {
      return false;
    }
    const days = this.daysUntilDue(f);
    return days !== null && days < 0;
  }

  daysUntilDue(f: FollowUp): number | null {
    const today = parseDateOnly(toDateOnlyString(new Date()));
    const due = parseDateOnly(f.dueDate);
    if (!today || !due) {
      return null;
    }
    return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }

  listOverdue(): FollowUp[] {
    return this.items().filter((f) => this.isOverdue(f));
  }

  create(input: FollowUpInput, actorName = 'ระบบ'): Observable<FollowUp> {
    if (!input.title.trim() || !input.customerId || !input.dueDate) {
      return throwError(() => new Error('กรุณากรอกหัวข้อ ลูกค้า และวันครบกำหนด'));
    }
    const now = new Date().toISOString();
    const row: FollowUp = {
      id: this.nextId++,
      customerId: input.customerId,
      title: input.title.trim(),
      dueDate: input.dueDate,
      assigneeId: input.assigneeId ?? null,
      channel: input.channel,
      status: input.status,
      note: input.note?.trim() || null,
      completedAt: input.status === 'DONE' ? now : null,
      createdAt: now,
      updatedAt: now,
    };
    this.items.update((list) => [row, ...list]);
    this.audit.log({
      actorUserId: null,
      actorName,
      action: 'CREATE',
      entityType: 'follow-up',
      entityId: row.id,
      summary: `สร้างแผนติดตาม: ${row.title}`,
    });
    return of(structuredClone(row)).pipe(delay(220));
  }

  update(id: number, input: FollowUpInput, actorName = 'ระบบ'): Observable<FollowUp> {
    const current = this.getById(id);
    if (!current) {
      return throwError(() => new Error('ไม่พบแผนติดตาม'));
    }
    const now = new Date().toISOString();
    const updated: FollowUp = {
      ...current,
      customerId: input.customerId,
      title: input.title.trim(),
      dueDate: input.dueDate,
      assigneeId: input.assigneeId ?? null,
      channel: input.channel,
      status: input.status,
      note: input.note?.trim() || null,
      completedAt:
        input.status === 'DONE' ? current.completedAt ?? now : null,
      updatedAt: now,
    };
    this.items.update((list) => list.map((f) => (f.id === id ? updated : f)));
    this.audit.log({
      actorUserId: null,
      actorName,
      action: input.status !== current.status ? 'STATUS_CHANGE' : 'UPDATE',
      entityType: 'follow-up',
      entityId: id,
      summary: `อัปเดตแผนติดตาม: ${updated.title}`,
    });
    return of(structuredClone(updated)).pipe(delay(200));
  }

  markDone(id: number, actorName = 'ระบบ'): Observable<FollowUp> {
    const current = this.getById(id);
    if (!current) {
      return throwError(() => new Error('ไม่พบแผนติดตาม'));
    }
    return this.update(
      id,
      {
        customerId: current.customerId,
        title: current.title,
        dueDate: current.dueDate,
        assigneeId: current.assigneeId,
        channel: current.channel,
        status: 'DONE',
        note: current.note,
      },
      actorName
    );
  }

  ensureDemoSeed(
    customerId: number,
    assigneeId: number | null,
    secondCustomerId?: number | null
  ): Observable<FollowUp[]> {
    if (this.demoSeeded || this.items().length > 0) {
      return this.list();
    }
    const rows = buildMockFollowUps({ customerId, assigneeId, secondCustomerId });
    this.items.set(rows);
    this.nextId = Math.max(...rows.map((r) => r.id)) + 1;
    this.demoSeeded = true;
    return of(structuredClone(rows)).pipe(delay(160));
  }
}
