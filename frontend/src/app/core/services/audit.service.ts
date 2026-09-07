import { Injectable, signal } from '@angular/core';
import { Observable, delay, of } from 'rxjs';
import {
  AuditAction,
  AuditEntityType,
  AuditLog,
} from '../models/audit.model';

const KEY = 'cpams_mock_audit_logs';

const SEED: AuditLog[] = [
  {
    id: 1,
    actorUserId: 1,
    actorName: 'สมชาย ผู้ดูแลสูงสุด',
    action: 'LOGIN',
    entityType: 'system',
    entityId: null,
    summary: 'เข้าสู่ระบบ (mock)',
    createdAt: '2026-09-07T08:00:00.000Z',
  },
  {
    id: 2,
    actorUserId: 2,
    actorName: 'สมหญิง ผู้ดูแลระบบ',
    action: 'CREATE',
    entityType: 'customer',
    entityId: 3,
    summary: 'สร้างลูกค้า: บริษัท ดิจิทัลฟาร์ม จำกัด',
    createdAt: '2026-08-20T09:05:00.000Z',
  },
  {
    id: 3,
    actorUserId: 3,
    actorName: 'วิชัย ซัพพอร์ต',
    action: 'STATUS_CHANGE',
    entityType: 'ticket',
    entityId: 2,
    summary: 'เปลี่ยนสถานะปัญหา TK-2026-002 เป็นกลับมาเป็นซ้ำ',
    createdAt: '2026-08-25T11:00:00.000Z',
  },
  {
    id: 4,
    actorUserId: 2,
    actorName: 'สมหญิง ผู้ดูแลระบบ',
    action: 'UPDATE',
    entityType: 'ma',
    entityId: 1,
    summary: 'อัปเดตสัญญา MA-2026-001 (โควตา/แผน)',
    createdAt: '2026-09-01T14:20:00.000Z',
  },
  {
    id: 5,
    actorUserId: 4,
    actorName: 'นภา ดูแลหลายด้าน',
    action: 'CREATE',
    entityType: 'follow-up',
    entityId: 1,
    summary: 'สร้างแผนติดตาม: ติดตามต่อสัญญา MA ประจำปี',
    createdAt: '2026-08-20T09:10:00.000Z',
  },
  {
    id: 6,
    actorUserId: 1,
    actorName: 'สมชาย ผู้ดูแลสูงสุด',
    action: 'UPDATE',
    entityType: 'role',
    entityId: 1,
    summary: 'แก้สิทธิ์บทบาทซัพพอร์ต',
    createdAt: '2026-09-03T10:00:00.000Z',
  },
];

export interface AuditLogInput {
  actorUserId: number | null;
  actorName: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: number | null;
  summary: string;
}

@Injectable({ providedIn: 'root' })
export class AuditService {
  private readonly items = signal<AuditLog[]>(this.load());
  private nextId = this.maxId(this.items()) + 1;

  readonly logs = this.items.asReadonly();

  list(): Observable<AuditLog[]> {
    return of(structuredClone(this.items())).pipe(delay(150));
  }

  log(input: AuditLogInput): AuditLog {
    const row: AuditLog = {
      id: this.nextId++,
      actorUserId: input.actorUserId,
      actorName: input.actorName || 'ระบบ',
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: input.summary,
      createdAt: new Date().toISOString(),
    };
    this.items.update((list) => {
      const next = [row, ...list];
      this.save(next);
      return next;
    });
    return row;
  }

  private load(): AuditLog[] {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        return JSON.parse(raw) as AuditLog[];
      }
    } catch {
      /* ignore */
    }
    const data = structuredClone(SEED);
    this.save(data);
    return data;
  }

  private save(data: AuditLog[]): void {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  private maxId(items: { id: number }[]): number {
    return items.reduce((max, i) => Math.max(max, i.id), 0);
  }
}
