import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { apiErrorMessage } from '../http/api-error';
import { asList, asPage, fetchAllPages, pruneUndefined, toHttpParams, upsertById } from '../http/api.util';
import {
  BillingType,
  OPEN_TICKET_STATUSES,
  ReportedChannel,
  ResolutionResult,
  Ticket,
  TicketPriority,
  TicketResolution,
} from '../models/ticket.model';
import { TicketQuotaSummary } from '../models/ma.model';
import { UserSummary } from '../models/user.model';
import { UserService } from './user.service';

/** CreateTicketDto */
export interface TicketCreateInput {
  customerId: number;
  title: string;
  reportedChannel: ReportedChannel;
  reportedAt: string;
  projectId?: number | null;
  billingType?: BillingType;
  description?: string | null;
  priority?: TicketPriority;
  reportedByContactId?: number | null;
  receivedByUserId?: number | null;
  assignedUserId?: number | null;
  dueAt?: string | null;
}

/** UpdateTicketDto — PATCH /tickets/:id (ห้ามส่ง customerId / status / assignedUserId / ฟิลด์ระบบ) */
export interface TicketUpdateInput {
  title?: string;
  description?: string | null;
  priority?: TicketPriority;
  billingType?: BillingType;
  reportedChannel?: ReportedChannel;
  reportedAt?: string;
  projectId?: number | null;
  reportedByContactId?: number | null;
  receivedByUserId?: number | null;
  dueAt?: string | null;
}

/** CreateResolutionDto */
export interface ResolutionCreateInput {
  result: ResolutionResult;
  detail: string;
  resolvedAt: string;
  rootCause?: string | null;
  resolvedByUserId?: number | null;
  startedAt?: string | null;
  hoursSpent?: number | null;
  extraCharge?: number | null;
}

export interface TicketListParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  status?: Ticket['status'];
  customerId?: number;
  projectId?: number;
  priority?: TicketPriority;
  assigneeId?: number;
  billingType?: BillingType;
}

interface ApiTicket extends Omit<Ticket, 'extraCharge' | 'resolutions'> {
  extraCharge?: string | number | null;
  resolutions?: ApiResolution[] | null;
  assignedUser?: UserSummary | null;
  receivedByUser?: UserSummary | null;
}

interface ApiResolution extends Omit<TicketResolution, 'hoursSpent'> {
  hoursSpent?: string | number | null;
  resolvedBy?: UserSummary | null;
}

interface ResolutionCreatedDto {
  ticket: ApiTicket;
  resolution: ApiResolution;
  /** QuotaSummaryDto — โครงเดียวกับ MA quota ยกเว้น isOverQuota */
  quota?: TicketQuotaSummary | null;
}

export interface ResolutionCreatedResult {
  resolution: TicketResolution;
  quota: TicketQuotaSummary | null;
}

@Injectable({ providedIn: 'root' })
export class TicketService {
  private readonly http = inject(HttpClient);
  private readonly usersApi = inject(UserService);
  private readonly base = `${environment.apiBaseUrl}/tickets`;
  private readonly items = signal<Ticket[]>([]);

  readonly tickets = this.items.asReadonly();
  readonly openCount = computed(
    () => this.items().filter((t) => OPEN_TICKET_STATUSES.includes(t.status)).length
  );

  list(params: TicketListParams = {}): Observable<Ticket[]> {
    // รายการเต็ม — วนหน้าอัตโนมัติเมื่อไม่ระบุ page
    if (params.page == null) {
      const { page: _p, limit: _l, ...rest } = params;
      return this.listAll(rest);
    }
    return this.listPage(params).pipe(
      map((page) => page.items),
      tap((rows) => this.items.set(rows)),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  /** หนึ่งหน้า — ใช้เมื่อต้องการ total / วนเอง */
  listPage(
    params: TicketListParams = {}
  ): Observable<{ items: Ticket[]; total: number }> {
    const { page, limit, ...rest } = params;
    return this.http
      .get<ApiTicket[] | { items: ApiTicket[]; total?: number }>(this.base, {
        params: toHttpParams({
          page: page ?? 1,
          limit: Math.min(limit ?? 100, 100),
          ...rest,
        }),
      })
      .pipe(
        map((body) => {
          const pageBody = asPage(body);
          return {
            items: pageBody.items.map((row) => this.normalizeTicket(row)),
            total: pageBody.total,
          };
        }),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  /** ดึงครบทุกหน้า (limit ≤ 100 ต่อครั้ง) — ใช้แท็บปัญหาของโปรเจค / รายการที่ต้องครบ */
  listAll(params: Omit<TicketListParams, 'page' | 'limit'> = {}): Observable<Ticket[]> {
    return fetchAllPages((page, limit) => this.listPage({ ...params, page, limit })).pipe(
      tap((rows) => {
        // merge — ห้าม set ทับทั้ง store (เช่นโหลดแค่ใบของโปรเจคเดียว)
        this.items.update((all) => {
          const byId = new Map(all.map((t) => [t.id, t]));
          for (const row of rows) {
            byId.set(row.id, row);
          }
          return Array.from(byId.values());
        });
      }),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  /** GET /tickets/pending — ใบค้างแก้ */
  listPending(
    params: Omit<TicketListParams, 'status' | 'projectId' | 'billingType'> = {}
  ): Observable<Ticket[]> {
    return this.http
      .get<ApiTicket[] | { items: ApiTicket[] }>(`${this.base}/pending`, {
        params: toHttpParams({ limit: 100, ...params }),
      })
      .pipe(
        map((body) => asList(body).map((row) => this.normalizeTicket(row))),
        tap((rows) => {
          this.items.update((all) => {
            const byId = new Map(all.map((t) => [t.id, t]));
            for (const row of rows) {
              byId.set(row.id, row);
            }
            return Array.from(byId.values());
          });
        }),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  getById(id: number): Ticket | undefined {
    return this.items().find((t) => t.id === id);
  }

  get(id: number): Observable<Ticket> {
    return this.http.get<ApiTicket>(`${this.base}/${id}`).pipe(
      map((row) => this.normalizeTicket(row)),
      tap((row) => this.items.update((list) => upsertById(list, row))),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  getByCustomer(customerId: number): Ticket[] {
    return this.items().filter((t) => t.customerId === customerId);
  }

  getByProject(projectId: number): Ticket[] {
    return this.items().filter((t) => t.projectId === projectId);
  }

  openQueue(): Ticket[] {
    return this.items().filter((t) => OPEN_TICKET_STATUSES.includes(t.status));
  }

  create(input: TicketCreateInput): Observable<Ticket> {
    if (!input.title.trim() || !input.customerId) {
      return throwError(() => new Error('กรุณาระบุหัวข้อและลูกค้า'));
    }
    return this.http
      .post<ApiTicket>(
        this.base,
        pruneUndefined({
          customerId: input.customerId,
          title: input.title.trim(),
          reportedChannel: input.reportedChannel,
          reportedAt: input.reportedAt,
          projectId: input.projectId ?? undefined,
          billingType: input.billingType,
          description: input.description?.trim() || undefined,
          priority: input.priority,
          reportedByContactId: input.reportedByContactId ?? undefined,
          receivedByUserId: input.receivedByUserId ?? undefined,
          assignedUserId: input.assignedUserId ?? undefined,
          dueAt: input.dueAt ?? undefined,
        })
      )
      .pipe(
        map((row) => this.normalizeTicket(row)),
        tap((row) => this.items.update((list) => upsertById(list, row))),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  /** PATCH /tickets/:id — แก้ข้อมูลใบ (ห้ามส่ง status / customerId) */
  update(id: number, input: TicketUpdateInput): Observable<Ticket> {
    return this.http
      .patch<ApiTicket>(
        `${this.base}/${id}`,
        pruneUndefined({
          title: input.title?.trim(),
          reportedChannel: input.reportedChannel,
          reportedAt: input.reportedAt,
          projectId: input.projectId === undefined ? undefined : input.projectId,
          billingType: input.billingType,
          description:
            input.description === undefined
              ? undefined
              : input.description?.trim() || null,
          priority: input.priority,
          reportedByContactId: input.reportedByContactId,
          receivedByUserId: input.receivedByUserId,
          dueAt: input.dueAt,
        })
      )
      .pipe(
        map((row) => this.normalizeTicket(row)),
        tap((row) => this.items.update((list) => upsertById(list, row))),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  /** ลบใบปัญหา — ใช้เทส/ล้างข้อมูล (ถ้า backend ยังไม่มีจะได้ error จาก API) */
  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`).pipe(
      tap(() => this.items.update((list) => list.filter((t) => t.id !== id))),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  assign(
    id: number,
    assignedUserId: number | null,
    dueAt?: string | null
  ): Observable<Ticket> {
    return this.http
      .patch<ApiTicket>(`${this.base}/${id}/assign`, pruneUndefined({
        assignedUserId,
        dueAt: dueAt ?? undefined,
      }))
      .pipe(
        map((row) => this.normalizeTicket(row)),
        tap((row) => this.items.update((list) => upsertById(list, row))),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  reopen(id: number, reason?: string | null): Observable<Ticket> {
    return this.http
      .patch<ApiTicket>(`${this.base}/${id}/reopen`, pruneUndefined({
        reason: reason?.trim() || undefined,
      }))
      .pipe(
        map((row) => this.normalizeTicket(row)),
        tap((row) => this.items.update((list) => upsertById(list, row))),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  close(
    id: number,
    opts?: { note?: string | null; extraCharge?: number | null }
  ): Observable<Ticket> {
    return this.http
      .patch<ApiTicket>(`${this.base}/${id}/close`, pruneUndefined({
        note: opts?.note?.trim() || undefined,
        extraCharge:
          opts?.extraCharge != null && !Number.isNaN(opts.extraCharge)
            ? opts.extraCharge.toFixed(2)
            : undefined,
      }))
      .pipe(
        map((row) => this.normalizeTicket(row)),
        tap((row) => this.items.update((list) => upsertById(list, row))),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  getResolutions(ticketId: number): TicketResolution[] {
    const ticket = this.getById(ticketId);
    return [...(ticket?.resolutions ?? [])].sort((a, b) => a.round - b.round);
  }

  addResolution(
    ticketId: number,
    input: ResolutionCreateInput
  ): Observable<ResolutionCreatedResult> {
    if (!input.detail.trim()) {
      return throwError(() => new Error('กรุณาระบุรายละเอียดการแก้ไข'));
    }
    return this.http
      .post<ResolutionCreatedDto>(`${this.base}/${ticketId}/resolutions`, pruneUndefined({
        result: input.result,
        detail: input.detail.trim(),
        resolvedAt: input.resolvedAt,
        rootCause: input.rootCause?.trim() || undefined,
        resolvedByUserId: input.resolvedByUserId ?? undefined,
        startedAt: input.startedAt ?? undefined,
        hoursSpent:
          input.hoursSpent != null && !Number.isNaN(input.hoursSpent)
            ? input.hoursSpent.toFixed(2)
            : undefined,
        extraCharge:
          input.extraCharge != null && !Number.isNaN(input.extraCharge)
            ? input.extraCharge.toFixed(2)
            : undefined,
      }))
      .pipe(
        map((body) => {
          const ticket = this.normalizeTicket(body.ticket);
          this.items.update((list) => upsertById(list, ticket));
          return {
            resolution: this.normalizeResolution(body.resolution),
            quota: body.quota ?? null,
          };
        }),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  private normalizeTicket(row: ApiTicket): Ticket {
    this.syncUserSummaries(row);
    const resolutions = (row.resolutions ?? []).map((r) => this.normalizeResolution(r));
    return {
      ...row,
      ticketNo: row.ticketNo ?? null,
      description: row.description ?? null,
      projectId: row.projectId ?? null,
      reportedByContactId: row.reportedByContactId ?? null,
      receivedByUserId: row.receivedByUserId ?? null,
      assignedUserId: row.assignedUserId ?? null,
      warrantyId: row.warrantyId ?? null,
      maContractId: row.maContractId ?? null,
      firstResponseAt: row.firstResponseAt ?? null,
      resolvedAt: row.resolvedAt ?? null,
      closedAt: row.closedAt ?? null,
      dueAt: row.dueAt ?? null,
      extraCharge: toNullableNumber(row.extraCharge),
      resolutionCount: row.resolutionCount ?? resolutions.length,
      resolutions,
    };
  }

  private normalizeResolution(row: ApiResolution): TicketResolution {
    if (row.resolvedBy) {
      this.usersApi.upsertLocal(row.resolvedBy);
    }
    return {
      ...row,
      rootCause: row.rootCause ?? null,
      resolvedByUserId: row.resolvedByUserId ?? null,
      startedAt: row.startedAt ?? null,
      hoursSpent: toNullableNumber(row.hoursSpent),
    };
  }

  private syncUserSummaries(row: ApiTicket): void {
    if (row.assignedUser) {
      this.usersApi.upsertLocal(row.assignedUser);
    }
    if (row.receivedByUser) {
      this.usersApi.upsertLocal(row.receivedByUser);
    }
  }
}

function toNullableNumber(value: string | number | null | undefined): number | null {
  if (value == null || value === '') {
    return null;
  }
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}
