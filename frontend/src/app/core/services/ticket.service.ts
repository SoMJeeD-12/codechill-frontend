import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, forkJoin, of, throwError } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
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
  TicketResolutionStep,
} from '../models/ticket.model';
import { Attachment, AttachmentRefType } from '../models/attachment.model';
import { TicketQuotaSummary } from '../models/ma.model';
import { UserSummary } from '../models/user.model';
import { TicketDemoOverlayService } from './ticket-demo-overlay.service';
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
  /** string ทศนิยม — ใช้กับ ONE_TIME / ADDON · null = ล้างค่า */
  extraCharge?: string | null;
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

/** GET /tickets/support-queue?tab= */
export type SupportQueueTab = 'AWAITING_SEND' | 'RETURNED';

/** GET /tickets/admin-queue?tab= */
export type AdminQueueTab =
  | 'AWAITING_CLAIM'
  | 'CLAIMED'
  | 'AWAITING_REVIEW'
  | 'WITH_SUPPORT';

export interface TicketQueueListParams {
  tab: SupportQueueTab | AdminQueueTab;
  page?: number;
  limit?: number;
  search?: string;
}

interface ApiTicket extends Omit<Ticket, 'extraCharge' | 'resolutions'> {
  extraCharge?: string | number | null;
  resolutions?: ApiResolution[] | null;
  assignedUser?: UserSummary | null;
  receivedByUser?: UserSummary | null;
  claimedByAdminUser?: UserSummary | null;
}

interface ApiResolution
  extends Omit<TicketResolution, 'hoursSpent' | 'steps' | 'attachments'> {
  hoursSpent?: string | number | null;
  resolvedBy?: UserSummary | null;
  steps?: TicketResolutionStep[] | null;
  attachments?: ApiEmbeddedAttachment[] | null;
}

type ApiEmbeddedAttachment = {
  id?: number;
  refType?: string;
  refId?: number;
  fileName?: string;
  originalName?: string;
  fileSize?: number | null;
  sizeBytes?: number | null;
  mimeType?: string | null;
  note?: string | null;
  downloadUrl?: string | null;
  createdAt?: string;
};

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

/** GET /tickets/:id/confirmation-print — ข้อมูลจัดหน้าใบยืนยัน (ห้าม e-sign) */
export interface TicketConfirmationPrintPayload {
  documentTitle: string;
  ticket: {
    id: number;
    ticketNo: string | null;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    billingType: string;
    reportedChannel: string;
    reportedAt: string;
    resolvedAt: string | null;
    closedAt: string | null;
  };
  customer: {
    id: number;
    code: string | null;
    name: string;
    taxId: string | null;
    address: string | null;
    phone: string | null;
  };
  project: { id: number; code: string | null; name: string } | null;
  reportedByContact: {
    id: number;
    name: string;
    phone: string | null;
    email: string | null;
  } | null;
  resolution: TicketResolution;
  allResolutions: TicketResolution[];
  signatureBlocks: Array<{ role: string; label: string }>;
  /** หลังสแกนใบที่เซ็นแล้ว — POST /attachments ตามนี้ */
  attachScanHint: {
    refType: AttachmentRefType;
    refId: number;
    noteSuggestion: string | null;
  };
}

/**
 * GET /tickets/billing-suggestion?projectId=&reportedAt=
 * ค่าที่ระบบเสนออยู่ที่ suggested — คนเลือกเองตอน POST /tickets
 * แถบสรุปอ่านฟิลด์จาก response นี้เท่านั้น (ห้ามประกอบจาก list warranty/MA)
 */
export interface TicketBillingSuggestion {
  suggested: BillingType | null;
  reason: string | null;
  warrantyEndDate: string | null;
  warrantyScopeNote: string | null;
  maPlanName: string | null;
  maRemaining: number | null;
  maIsExhausted: boolean;
  maIsReferenceOnly: boolean;
}

type ApiBillingSuggestion = {
  suggested?: string | null;
  reason?: string | null;
  warrantyEndDate?: string | null;
  warrantyScopeNote?: string | null;
  warrantyCoverage?: {
    endDate?: string | null;
    scopeNote?: string | null;
  } | null;
  maRemaining?: number | null;
  maIsExhausted?: boolean | null;
  maIsReferenceOnly?: boolean | null;
  maCoverage?: {
    planName?: string | null;
  } | null;
};

@Injectable({ providedIn: 'root' })
export class TicketService {
  private readonly http = inject(HttpClient);
  private readonly usersApi = inject(UserService);
  private readonly demoOverlay = inject(TicketDemoOverlayService);
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

  /** ดึงครบทุกหน้า (limit ≤ 100 ต่อครั้ง) — ใช้แท็บปัญหาของโปรเจกต์ / รายการที่ต้องครบ */
  listAll(params: Omit<TicketListParams, 'page' | 'limit'> = {}): Observable<Ticket[]> {
    return fetchAllPages((page, limit) => this.listPage({ ...params, page, limit })).pipe(
      tap((rows) => {
        // merge — ห้าม set ทับทั้ง store (เช่นโหลดแค่ใบของโปรเจกต์เดียว)
        // คง resolutions จาก cache ถ้า list ไม่ส่งมา
        this.items.update((all) => {
          const byId = new Map(all.map((t) => [t.id, t]));
          for (const row of rows) {
            byId.set(row.id, this.mergePreservingResolutions(byId.get(row.id), row));
          }
          return Array.from(byId.values());
        });
      }),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  /**
   * รายการมักไม่มี resolutions — ดึงรายละเอียดใบ RESOLVED เพื่อรู้ว่า partial หรือสำเร็จจริง
   * (ชั่วคราวจนกว่า BE จะคง IN_PROGRESS หลัง PARTIAL/FAILED)
   */
  enrichIncompleteWork(tickets: Ticket[]): Observable<Ticket[]> {
    const needFetch = tickets.filter(
      (t) =>
        t.status === 'RESOLVED' &&
        (t.resolutionCount ?? 0) > 0 &&
        !(t.resolutions && t.resolutions.length > 0)
    );
    if (!needFetch.length) {
      for (const t of tickets) {
        if (t.resolutions?.length) {
          this.demoOverlay.syncIncompleteWorkFromTicket(t);
        }
      }
      return of(tickets);
    }

    const capped = needFetch.slice(0, 40);
    return forkJoin(
      capped.map((t) =>
        this.get(t.id).pipe(
          catchError(() => of(null as Ticket | null))
        )
      )
    ).pipe(
      map((details) => {
        const byId = new Map(tickets.map((t) => [t.id, t]));
        for (const d of details) {
          if (!d) {
            continue;
          }
          this.demoOverlay.syncIncompleteWorkFromTicket(d);
          byId.set(d.id, d);
        }
        for (const t of byId.values()) {
          if (t.resolutions?.length) {
            this.demoOverlay.syncIncompleteWorkFromTicket(t);
          }
        }
        return tickets.map((t) => byId.get(t.id) ?? t);
      })
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

  /** GET /tickets/pending แบบแบ่งหน้าฝั่ง server — ใช้ total จาก API */
  listPendingPage(
    params: Omit<TicketListParams, 'status' | 'projectId' | 'billingType'> & {
      page: number;
      limit: number;
      sortBy?: string;
      sortOrder?: 'ASC' | 'DESC';
    }
  ): Observable<{ items: Ticket[]; total: number }> {
    return this.http
      .get<ApiTicket[] | { items: ApiTicket[]; total?: number }>(`${this.base}/pending`, {
        params: toHttpParams({ ...params }),
      })
      .pipe(
        map((body) => {
          const page = asPage(body);
          return { items: page.items.map((row) => this.normalizeTicket(row)), total: page.total };
        }),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  /** GET /tickets/support-queue?tab=AWAITING_SEND|RETURNED */
  listSupportQueue(
    params: { tab: SupportQueueTab; page?: number; limit?: number; search?: string }
  ): Observable<{ items: Ticket[]; total: number }> {
    return this.listQueuePage('support-queue', params);
  }

  /**
   * GET /tickets/admin-queue?tab=
   * AWAITING_CLAIM | CLAIMED | AWAITING_REVIEW | WITH_SUPPORT
   */
  listAdminQueue(
    params: { tab: AdminQueueTab; page?: number; limit?: number; search?: string }
  ): Observable<{ items: Ticket[]; total: number }> {
    return this.listQueuePage('admin-queue', params);
  }

  private listQueuePage(
    path: 'support-queue' | 'admin-queue',
    params: { tab: string; page?: number; limit?: number; search?: string }
  ): Observable<{ items: Ticket[]; total: number }> {
    const { page, limit, tab, search } = params;
    return this.http
      .get<ApiTicket[] | { items: ApiTicket[]; total?: number }>(`${this.base}/${path}`, {
        params: toHttpParams({
          tab,
          page: page ?? 1,
          limit: Math.min(limit ?? 20, 100),
          search: search?.trim() || undefined,
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
        tap((pageBody) => {
          this.items.update((all) => {
            const byId = new Map(all.map((t) => [t.id, t]));
            for (const row of pageBody.items) {
              byId.set(row.id, this.mergePreservingResolutions(byId.get(row.id), row));
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

  /** GET /tickets/billing-suggestion — บังคับ projectId + reportedAt ทั้งคู่ */
  getBillingSuggestion(
    projectId: number,
    reportedAt: string
  ): Observable<TicketBillingSuggestion> {
    return this.http
      .get<ApiBillingSuggestion>(`${this.base}/billing-suggestion`, {
        params: toHttpParams({ projectId, reportedAt }),
      })
      .pipe(
        map((row) => this.normalizeBillingSuggestion(row)),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  private normalizeBillingSuggestion(
    row: ApiBillingSuggestion | null | undefined
  ): TicketBillingSuggestion {
    const coverage = row?.warrantyCoverage;
    const maCoverage = row?.maCoverage;
    const warrantyEndDate =
      (typeof row?.warrantyEndDate === 'string' && row.warrantyEndDate.trim()) ||
      (typeof coverage?.endDate === 'string' && coverage.endDate.trim()) ||
      null;
    const warrantyScopeNote =
      (typeof row?.warrantyScopeNote === 'string' && row.warrantyScopeNote.trim()) ||
      (typeof coverage?.scopeNote === 'string' && coverage.scopeNote.trim()) ||
      null;
    const maPlanName =
      (typeof maCoverage?.planName === 'string' && maCoverage.planName.trim()) || null;
    const maRemaining =
      typeof row?.maRemaining === 'number' && Number.isFinite(row.maRemaining)
        ? row.maRemaining
        : null;
    return {
      suggested: this.asBillingType(row?.suggested),
      reason: row?.reason?.trim() || null,
      warrantyEndDate,
      warrantyScopeNote,
      maPlanName,
      maRemaining,
      maIsExhausted: row?.maIsExhausted === true,
      maIsReferenceOnly: row?.maIsReferenceOnly === true,
    };
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
          extraCharge: input.extraCharge,
        })
      )
      .pipe(
        map((row) => this.normalizeTicket(row)),
        tap((row) => this.items.update((list) => upsertById(list, row))),
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

  /** PATCH /tickets/:id/send-to-admin — ซัพพอร์ตส่งเข้าคิวกลาง (ไม่มี body) */
  sendToAdmin(id: number): Observable<Ticket> {
    return this.patchTicketAction(id, 'send-to-admin');
  }

  /** PATCH /tickets/:id/claim — แอดมินรับคิว → เป็น claimedByAdminUser */
  claim(id: number): Observable<Ticket> {
    return this.patchTicketAction(id, 'claim');
  }

  /**
   * PATCH /tickets/:id/return-to-support
   * ใบต้องเป็น RESOLVED ก่อน (พนักงานบันทึก resolution แล้ว)
   * body รับแค่ note (≤2000) — field อื่นได้ 400
   */
  returnToSupport(id: number, note?: string | null): Observable<Ticket> {
    const trimmed = note?.trim();
    return this.http
      .patch<ApiTicket>(`${this.base}/${id}/return-to-support`, trimmed ? { note: trimmed } : {})
      .pipe(
        map((row) => this.normalizeTicket(row)),
        tap((row) => this.items.update((list) => upsertById(list, row))),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  /**
   * PATCH /tickets/:id/reject-review — ตรวจไม่ผ่าน · RESOLVED → IN_PROGRESS
   * reason บังคับ (≤2000) · 409 = ไม่อยู่ในสถานะรอตรวจ / ไม่มีผู้รับผิดชอบ
   */
  rejectReview(id: number, reason: string): Observable<Ticket> {
    return this.http
      .patch<ApiTicket>(`${this.base}/${id}/reject-review`, { reason: reason.trim() })
      .pipe(
        map((row) => this.normalizeTicket(row)),
        tap((row) => this.items.update((list) => upsertById(list, row))),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  /** PATCH /tickets/:id/customer-notified — ซัพพอร์ตบอกลูกค้าแล้ว */
  customerNotified(id: number, opts?: { note?: string | null }): Observable<Ticket> {
    return this.http
      .patch<ApiTicket>(
        `${this.base}/${id}/customer-notified`,
        pruneUndefined({ note: opts?.note?.trim() || undefined })
      )
      .pipe(
        map((row) => this.normalizeTicket(row)),
        tap((row) => this.items.update((list) => upsertById(list, row))),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  private patchTicketAction(id: number, action: string): Observable<Ticket> {
    return this.http.patch<ApiTicket>(`${this.base}/${id}/${action}`, {}).pipe(
      map((row) => this.normalizeTicket(row)),
      tap((row) => this.items.update((list) => upsertById(list, row))),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  /**
   * PATCH /tickets/:id/start
   * ผู้รับผิดชอบเท่านั้น — หลังสถานะ ASSIGNED → IN_PROGRESS
   */
  start(id: number): Observable<Ticket> {
    return this.http.patch<ApiTicket>(`${this.base}/${id}/start`, {}).pipe(
      map((row) => this.normalizeTicket(row)),
      tap((row) => this.items.update((list) => upsertById(list, row))),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  /**
   * PATCH /tickets/:id/reopen แล้วตั้งผู้รับเรื่องเป็นคนที่เปิดรอบนี้ (PATCH /tickets/:id receivedByUserId)
   * แก้ผู้รับเรื่องไม่สำเร็จ (เช่น ไม่มีสิทธิ์ ticket.update) → คืนใบที่ reopen แล้วตามเดิม ไม่ขวางขั้นถัดไป
   */
  reopen(id: number, reason?: string | null, receiverUserId?: number | null): Observable<Ticket> {
    return this.http
      .patch<ApiTicket>(`${this.base}/${id}/reopen`, pruneUndefined({
        reason: reason?.trim() || undefined,
      }))
      .pipe(
        map((row) => this.normalizeTicket(row)),
        tap((row) => this.items.update((list) => upsertById(list, row))),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err)))),
        switchMap((row) =>
          receiverUserId != null && row.receivedByUserId !== receiverUserId
            ? this.update(id, { receivedByUserId: receiverUserId }).pipe(
                catchError((err: Error) => {
                  console.warn('[reopen] ตั้งผู้รับเรื่องไม่สำเร็จ', err.message);
                  return of(row);
                })
              )
            : of(row)
        )
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

  /**
   * GET /tickets/:id/confirmation-print?round=
   * FE จัดหน้าพิมพ์จาก JSON · ไม่ทำ e-sign
   */
  getConfirmationPrint(
    ticketId: number,
    round?: number | null
  ): Observable<TicketConfirmationPrintPayload> {
    return this.http
      .get<TicketConfirmationPrintPayload>(
        `${this.base}/${ticketId}/confirmation-print`,
        {
          params: toHttpParams({
            round: round != null && round > 0 ? round : undefined,
          }),
        }
      )
      .pipe(
        map((body) => this.normalizeConfirmationPrint(body)),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
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
          this.demoOverlay.syncIncompleteWorkFromTicket(ticket);
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
    const ticket: Ticket = {
      ...row,
      ticketNo: row.ticketNo ?? null,
      description: row.description ?? null,
      projectId: row.projectId ?? null,
      reportedByContactId: row.reportedByContactId ?? null,
      receivedByUserId: row.receivedByUserId ?? null,
      claimedByAdminUserId:
        row.claimedByAdminUserId ?? row.claimedByAdminUser?.id ?? null,
      assignedUserId: row.assignedUserId ?? row.assignedUser?.id ?? null,
      warrantyId: row.warrantyId ?? null,
      maContractId: row.maContractId ?? null,
      warrantyNo: row.warrantyNo ?? null,
      maContractNo: row.maContractNo ?? null,
      firstResponseAt: row.firstResponseAt ?? null,
      resolvedAt: row.resolvedAt ?? null,
      closedAt: row.closedAt ?? null,
      dueAt: row.dueAt ?? null,
      extraCharge: toNullableNumber(row.extraCharge),
      resolutionCount: row.resolutionCount ?? resolutions.length,
      resolutions,
    };
    if (resolutions.length) {
      this.demoOverlay.syncIncompleteWorkFromTicket(ticket);
    }
    return ticket;
  }

  private asBillingType(value: string | null | undefined): BillingType | null {
    if (!value) {
      return null;
    }
    const allowed: BillingType[] = ['WARRANTY', 'MA_QUOTA', 'ADDON', 'ONE_TIME', 'FREE'];
    return allowed.includes(value as BillingType) ? (value as BillingType) : null;
  }

  /** list มักไม่ส่ง resolutions — อย่าทับของที่มีใน cache */
  private mergePreservingResolutions(
    previous: Ticket | undefined,
    next: Ticket
  ): Ticket {
    if (
      previous?.resolutions?.length &&
      !(next.resolutions && next.resolutions.length)
    ) {
      return { ...next, resolutions: previous.resolutions };
    }
    return next;
  }

  private normalizeResolution(row: ApiResolution): TicketResolution {
    if (row.resolvedBy) {
      this.usersApi.upsertLocal(row.resolvedBy);
    }
    const steps = (row.steps ?? []).map((s) => ({
      code: String(s?.code ?? ''),
      label: String(s?.label ?? s?.code ?? '—'),
      at: s?.at ?? null,
      result: s?.result ?? null,
    }));
    return {
      id: row.id,
      ticketId: row.ticketId,
      round: row.round,
      result: row.result,
      detail: row.detail ?? '',
      rootCause: row.rootCause ?? null,
      resolvedByUserId: row.resolvedByUserId ?? row.resolvedBy?.id ?? null,
      resolvedBy: row.resolvedBy ?? null,
      startedAt: row.startedAt ?? null,
      resolvedAt: row.resolvedAt,
      hoursSpent: toNullableNumber(row.hoursSpent),
      steps,
      attachments: (row.attachments ?? []).map((a) =>
        this.normalizeEmbeddedAttachment(a, row.id)
      ),
      createdAt: row.createdAt,
    };
  }

  private normalizeConfirmationPrint(
    body: TicketConfirmationPrintPayload
  ): TicketConfirmationPrintPayload {
    const resolution = this.normalizeResolution(
      body.resolution as unknown as ApiResolution
    );
    const allResolutions = (body.allResolutions ?? []).map((r) =>
      this.normalizeResolution(r as unknown as ApiResolution)
    );
    const hint = body.attachScanHint;
    return {
      ...body,
      documentTitle: body.documentTitle?.trim() || 'ใบยืนยันการแก้ไขปัญหา',
      resolution,
      allResolutions,
      signatureBlocks: Array.isArray(body.signatureBlocks)
        ? body.signatureBlocks
        : [],
      attachScanHint: {
        refType: (hint?.refType ?? 'TICKET_RESOLUTION') as AttachmentRefType,
        refId: Number(hint?.refId) || resolution.id,
        noteSuggestion: hint?.noteSuggestion?.trim() || null,
      },
    };
  }

  private normalizeEmbeddedAttachment(
    row: ApiEmbeddedAttachment | null | undefined,
    fallbackRefId: number
  ): Attachment {
    const id = Number(row?.id) || 0;
    const fileName =
      (typeof row?.fileName === 'string' && row.fileName.trim()) ||
      (typeof row?.originalName === 'string' && row.originalName.trim()) ||
      `attachment-${id || 'file'}`;
    const fileSizeRaw = row?.fileSize ?? row?.sizeBytes;
    const fileSize =
      typeof fileSizeRaw === 'number' && Number.isFinite(fileSizeRaw)
        ? fileSizeRaw
        : null;
    return {
      id,
      refType: (row?.refType ?? 'TICKET_RESOLUTION') as AttachmentRefType,
      refId: Number(row?.refId) || fallbackRefId,
      fileName,
      fileSize,
      mimeType: row?.mimeType?.trim() || null,
      note: row?.note?.trim() || null,
      downloadUrl:
        (typeof row?.downloadUrl === 'string' && row.downloadUrl.trim()) ||
        `/api/attachments/${id}/download`,
      createdAt: row?.createdAt ?? '',
    };
  }

  private syncUserSummaries(row: ApiTicket): void {
    if (row.assignedUser) {
      this.usersApi.upsertLocal(row.assignedUser);
    }
    if (row.receivedByUser) {
      this.usersApi.upsertLocal(row.receivedByUser);
    }
    if (row.claimedByAdminUser) {
      this.usersApi.upsertLocal(row.claimedByAdminUser);
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
