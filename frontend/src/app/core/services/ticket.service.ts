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
  private readonly ticketsSignal = signal<Ticket[]>([]);
  private readonly resolutionsSignal = signal<TicketResolution[]>([]);

  private nextTicketId = 1;
  private nextResolutionId = 1;

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
    this.ticketsSignal.update((list) => [ticket, ...list]);
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
    this.ticketsSignal.update((list) => list.map((t) => (t.id === id ? updated : t)));
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
    this.ticketsSignal.update((list) => list.map((t) => (t.id === id ? updated : t)));
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

    this.resolutionsSignal.update((list) => [...list, resolution]);

    const nextStatus: TicketStatus =
      input.result === 'SUCCESS' ? 'RESOLVED' : 'IN_PROGRESS';

    this.ticketsSignal.update((list) =>
      list.map((t) =>
        t.id === ticketId
          ? {
              ...t,
              resolutionCount: round,
              status: t.status === 'RECEIVED' || t.status === 'REOPENED' ? nextStatus : nextStatus,
              assigneeId: t.assigneeId ?? input.resolvedByUserId,
            }
          : t
      )
    );

    return of(structuredClone(resolution)).pipe(delay(250));
  }
}
