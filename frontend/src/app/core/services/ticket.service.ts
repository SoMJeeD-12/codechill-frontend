import { Injectable, computed, signal } from '@angular/core';
import { Observable, delay, of, throwError } from 'rxjs';
import {
  BillingType,
  OPEN_TICKET_STATUSES,
  ReportedChannel,
  ResolutionResult,
  Ticket,
  TicketPriority,
  TicketResolution,
  TicketStatus,
} from '../models/ticket.model';

const TICKETS_KEY = 'cpams_mock_tickets';
const RESOLUTIONS_KEY = 'cpams_mock_resolutions';

const SEED_TICKETS: Ticket[] = [
  {
    id: 1,
    ticketNo: 'TK-2026-001',
    customerId: 1,
    projectId: 1,
    title: 'เซ็นเซอร์ไม่ส่งข้อมูล',
    description: 'เครื่องจักรสาย 2 ไม่ขึ้นค่าบนแดชบอร์ดตั้งแต่เช้า',
    category: 'ฮาร์ดแวร์',
    priority: 'HIGH',
    status: 'IN_PROGRESS',
    billingType: 'WARRANTY',
    chargeAmount: 0,
    reportedChannel: 'PHONE',
    reportedAt: '2026-09-01T10:15:00.000Z',
    receivedByUserId: 3,
    assigneeId: 3,
    resolutionCount: 1,
    closedAt: null,
    attachmentName: 'sensor-offline.png',
  },
  {
    id: 2,
    ticketNo: 'TK-2026-002',
    customerId: 2,
    projectId: 2,
    title: 'แอปแจ้งซ่อมค้างตอนอัปโหลดรูป',
    description: 'กดแนบรูปแล้วหมุนค้างบน Android',
    category: 'ซอฟต์แวร์',
    priority: 'MEDIUM',
    status: 'REOPENED',
    billingType: 'FREE',
    chargeAmount: 0,
    reportedChannel: 'LINE',
    reportedAt: '2026-08-18T09:00:00.000Z',
    receivedByUserId: 3,
    assigneeId: 2,
    resolutionCount: 2,
    closedAt: null,
    attachmentName: null,
  },
  {
    id: 3,
    ticketNo: 'TK-2026-003',
    customerId: 1,
    projectId: 1,
    title: 'ขอเพิ่มกราฟอุณหภูมิย้อนหลัง 90 วัน',
    description: 'ฟีเจอร์นอกขอบเขตเดิม',
    category: 'คำขอเพิ่ม',
    priority: 'LOW',
    status: 'CLOSED',
    billingType: 'PER_CASE',
    chargeAmount: 15000,
    reportedChannel: 'EMAIL',
    reportedAt: '2026-06-01T11:00:00.000Z',
    receivedByUserId: 2,
    assigneeId: 2,
    resolutionCount: 1,
    closedAt: '2026-06-20T16:00:00.000Z',
    attachmentName: null,
  },
  {
    id: 4,
    ticketNo: 'TK-2026-004',
    customerId: 2,
    projectId: null,
    title: 'สอบถามขั้นตอนเคลมทั่วไป',
    description: 'ลูกค้าโทรถามขั้นตอน ยังไม่ได้ผูกกับโครงการใด',
    category: 'สอบถาม',
    priority: 'URGENT',
    status: 'RECEIVED',
    billingType: 'FREE',
    chargeAmount: 0,
    reportedChannel: 'PHONE',
    reportedAt: '2026-09-08T04:30:00.000Z',
    receivedByUserId: 3,
    assigneeId: null,
    resolutionCount: 0,
    closedAt: null,
    attachmentName: null,
  },
];

const SEED_RESOLUTIONS: TicketResolution[] = [
  {
    id: 1,
    ticketId: 1,
    round: 1,
    rootCause: 'สายสัญญาณหลวมที่ตู้คอนโทรล',
    actionTaken: 'ขันหัวต่อและทดสอบสัญญาณ',
    spentHour: 2.5,
    result: 'PARTIAL',
    resolvedByUserId: 3,
    resolvedAt: '2026-09-01T15:00:00.000Z',
  },
  {
    id: 2,
    ticketId: 2,
    round: 1,
    rootCause: 'ไฟล์ใหญ่เกินลิมิตอัปโหลด',
    actionTaken: 'เพิ่มการย่อรูปฝั่งแอป',
    spentHour: 4,
    result: 'SUCCESS',
    resolvedByUserId: 2,
    resolvedAt: '2026-08-20T17:00:00.000Z',
  },
  {
    id: 3,
    ticketId: 2,
    round: 2,
    rootCause: 'ยังพังบน Android 12 บางรุ่น',
    actionTaken: 'แก้ memory leak ใน image picker',
    spentHour: 3,
    result: 'PARTIAL',
    resolvedByUserId: 2,
    resolvedAt: '2026-08-25T12:00:00.000Z',
  },
  {
    id: 4,
    ticketId: 3,
    round: 1,
    rootCause: 'อยู่นอกขอบเขตสัญญา',
    actionTaken: 'เสนอราคาและพัฒนาตามที่ตกลง',
    spentHour: 16,
    result: 'SUCCESS',
    resolvedByUserId: 2,
    resolvedAt: '2026-06-18T10:00:00.000Z',
  },
];

export interface TicketInput {
  customerId: number;
  projectId: number | null;
  title: string;
  description: string;
  category: string;
  priority: TicketPriority;
  billingType: BillingType;
  chargeAmount: number;
  reportedChannel: ReportedChannel;
  reportedAt: string;
  receivedByUserId: number;
  assigneeId: number | null;
  attachmentName: string | null;
}

export interface ResolutionInput {
  rootCause: string;
  actionTaken: string;
  spentHour: number;
  result: ResolutionResult;
  resolvedByUserId: number;
}

@Injectable({ providedIn: 'root' })
export class TicketService {
  private readonly ticketsSignal = signal<Ticket[]>(this.load(TICKETS_KEY, SEED_TICKETS));
  private readonly resolutionsSignal = signal<TicketResolution[]>(
    this.load(RESOLUTIONS_KEY, SEED_RESOLUTIONS)
  );

  private nextTicketId = this.maxId(this.ticketsSignal()) + 1;
  private nextResolutionId = this.maxId(this.resolutionsSignal()) + 1;

  readonly tickets = this.ticketsSignal.asReadonly();
  readonly openCount = computed(
    () => this.ticketsSignal().filter((t) => OPEN_TICKET_STATUSES.includes(t.status) && t.status !== 'RESOLVED').length
  );

  list(): Observable<Ticket[]> {
    return of(structuredClone(this.ticketsSignal())).pipe(delay(200));
  }

  getById(id: number): Ticket | undefined {
    return this.ticketsSignal().find((t) => t.id === id);
  }

  getByCustomer(customerId: number): Ticket[] {
    return this.ticketsSignal().filter((t) => t.customerId === customerId);
  }

  getByProject(projectId: number): Ticket[] {
    return this.ticketsSignal().filter((t) => t.projectId === projectId);
  }

  openQueue(): Ticket[] {
    return this.ticketsSignal().filter((t) =>
      ['RECEIVED', 'IN_PROGRESS', 'REOPENED'].includes(t.status)
    );
  }

  create(input: TicketInput): Observable<Ticket> {
    if (!input.title.trim() || !input.customerId) {
      return throwError(() => new Error('กรุณาระบุหัวข้อและลูกค้า'));
    }
    const ticket: Ticket = {
      id: this.nextTicketId++,
      ticketNo: `TK-${new Date().getFullYear()}-${String(this.nextTicketId).padStart(3, '0')}`,
      customerId: input.customerId,
      projectId: input.projectId,
      title: input.title.trim(),
      description: input.description.trim(),
      category: input.category.trim(),
      priority: input.priority,
      status: 'RECEIVED',
      billingType: input.billingType,
      chargeAmount: Number(input.chargeAmount) || 0,
      reportedChannel: input.reportedChannel,
      reportedAt: input.reportedAt || new Date().toISOString(),
      receivedByUserId: input.receivedByUserId,
      assigneeId: input.assigneeId,
      resolutionCount: 0,
      closedAt: null,
      attachmentName: input.attachmentName,
    };
    this.ticketsSignal.update((list) => {
      const next = [ticket, ...list];
      this.save(TICKETS_KEY, next);
      return next;
    });
    return of(structuredClone(ticket)).pipe(delay(250));
  }

  updateStatus(id: number, status: TicketStatus): Observable<Ticket> {
    const current = this.getById(id);
    if (!current) {
      return throwError(() => new Error('ไม่พบปัญหา'));
    }
    const updated: Ticket = {
      ...current,
      status,
      closedAt: status === 'CLOSED' ? new Date().toISOString() : current.closedAt,
    };
    if (status !== 'CLOSED') {
      updated.closedAt = null;
    }
    this.ticketsSignal.update((list) => {
      const next = list.map((t) => (t.id === id ? updated : t));
      this.save(TICKETS_KEY, next);
      return next;
    });
    return of(structuredClone(updated)).pipe(delay(150));
  }

  /** ปัญหาเดิมกลับมา — ย้อนสถานะเป็น REOPENED ไม่เปิดใบใหม่ */
  reopen(id: number): Observable<Ticket> {
    const current = this.getById(id);
    if (!current) {
      return throwError(() => new Error('ไม่พบปัญหา'));
    }
    if (!['RESOLVED', 'CLOSED'].includes(current.status)) {
      return throwError(() => new Error('เปิดซ้ำได้เฉพาะใบที่แก้แล้วหรือปิดแล้ว'));
    }
    const updated: Ticket = {
      ...current,
      status: 'REOPENED',
      closedAt: null,
    };
    this.ticketsSignal.update((list) => {
      const next = list.map((t) => (t.id === id ? updated : t));
      this.save(TICKETS_KEY, next);
      return next;
    });
    return of(structuredClone(updated)).pipe(delay(200));
  }

  getResolutions(ticketId: number): TicketResolution[] {
    return this.resolutionsSignal()
      .filter((r) => r.ticketId === ticketId)
      .sort((a, b) => a.round - b.round);
  }

  addResolution(ticketId: number, input: ResolutionInput): Observable<TicketResolution> {
    const ticket = this.getById(ticketId);
    if (!ticket) {
      return throwError(() => new Error('ไม่พบปัญหา'));
    }
    if (!input.rootCause.trim() || !input.actionTaken.trim()) {
      return throwError(() => new Error('กรุณาระบุสาเหตุและวิธีแก้'));
    }

    const round = ticket.resolutionCount + 1;
    const resolution: TicketResolution = {
      id: this.nextResolutionId++,
      ticketId,
      round,
      rootCause: input.rootCause.trim(),
      actionTaken: input.actionTaken.trim(),
      spentHour: Number(input.spentHour) || 0,
      result: input.result,
      resolvedByUserId: input.resolvedByUserId,
      resolvedAt: new Date().toISOString(),
    };

    this.resolutionsSignal.update((list) => {
      const next = [...list, resolution];
      this.save(RESOLUTIONS_KEY, next);
      return next;
    });

    const nextStatus: TicketStatus =
      input.result === 'SUCCESS' ? 'RESOLVED' : 'IN_PROGRESS';

    this.ticketsSignal.update((list) => {
      const next = list.map((t) =>
        t.id === ticketId
          ? {
              ...t,
              resolutionCount: round,
              status: t.status === 'RECEIVED' || t.status === 'REOPENED' ? nextStatus : nextStatus,
              assigneeId: t.assigneeId ?? input.resolvedByUserId,
            }
          : t
      );
      this.save(TICKETS_KEY, next);
      return next;
    });

    return of(structuredClone(resolution)).pipe(delay(250));
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
