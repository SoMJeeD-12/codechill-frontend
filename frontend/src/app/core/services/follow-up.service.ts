import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, delay, of, throwError } from 'rxjs';
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
  assigneeId: number | null;
  channel: FollowUpChannel;
  status: FollowUpStatus;
  note: string;
}

@Injectable({ providedIn: 'root' })
export class FollowUpService {
  private readonly audit = inject(AuditService);
  private readonly items = signal<FollowUp[]>([]);
  private nextId = 1;

  readonly followUps = this.items.asReadonly();
  readonly overdueCount = computed(() => this.listOverdue().length);

  list(): Observable<FollowUp[]> {
    return of(structuredClone(this.items())).pipe(delay(180));
  }

  getById(id: number): FollowUp | undefined {
    return this.items().find((f) => f.id === id);
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

  /** จำนวนวันถึงครบกำหนด (ลบ = เลยมาแล้ว) */
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
    const row: FollowUp = {
      id: this.nextId++,
      customerId: input.customerId,
      title: input.title.trim(),
      dueDate: input.dueDate,
      assigneeId: input.assigneeId,
      channel: input.channel,
      status: input.status,
      note: input.note.trim(),
      completedAt: input.status === 'DONE' ? new Date().toISOString() : null,
      createdAt: new Date().toISOString(),
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
    const updated: FollowUp = {
      ...current,
      customerId: input.customerId,
      title: input.title.trim(),
      dueDate: input.dueDate,
      assigneeId: input.assigneeId,
      channel: input.channel,
      status: input.status,
      note: input.note.trim(),
      completedAt:
        input.status === 'DONE'
          ? current.completedAt ?? new Date().toISOString()
          : null,
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
}
