import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { apiErrorMessage } from '../http/api-error';
import { asList, pruneUndefined, toHttpParams, upsertById } from '../http/api.util';
import {
  FollowUp,
  FollowUpStatus,
  FollowUpWritableStatus,
} from '../models/follow-up.model';

/** CreateFollowUpDto — ส่ง projectId หรือ customerId อย่างใดอย่างหนึ่ง */
export interface FollowUpCreateInput {
  projectId?: number;
  customerId?: number;
  title: string;
  dueDate: string;
  detail?: string | null;
  assignedUserId?: number | null;
}

/** UpdateFollowUpDto — ไม่มี customerId / ห้ามส่ง OVERDUE */
export interface FollowUpUpdateInput {
  title?: string;
  detail?: string | null;
  dueDate?: string;
  status?: FollowUpWritableStatus;
  assignedUserId?: number | null;
  resultNote?: string | null;
  projectId?: number | null;
}

export interface FollowUpCompleteInput {
  resultNote?: string | null;
}

export interface FollowUpListParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  customerId?: number;
  projectId?: number;
  assignedUserId?: number;
  status?: FollowUpStatus;
  /** ใช้ query ?overdue=true ตาม API */
  overdue?: boolean;
  dueFrom?: string;
  dueTo?: string;
}

/**
 * Follow-ups M7 — /api/follow-ups
 */
@Injectable({ providedIn: 'root' })
export class FollowUpService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/follow-ups`;
  private readonly items = signal<FollowUp[]>([]);

  readonly followUps = this.items.asReadonly();
  readonly overdueCount = computed(() => this.listOverdue().length);

  list(params: FollowUpListParams = {}): Observable<FollowUp[]> {
    return this.http
      .get<FollowUp[] | { items: FollowUp[] }>(this.base, {
        params: toHttpParams({
          limit: 100,
          ...params,
          overdue: params.overdue === true ? true : params.overdue === false ? false : undefined,
        }),
      })
      .pipe(
        map(asList),
        tap((rows) => {
          if (params.customerId != null) {
            this.items.update((all) => [
              ...all.filter((f) => f.customerId !== params.customerId),
              ...rows,
            ]);
          } else if (params.projectId != null) {
            this.items.update((all) => [
              ...all.filter((f) => f.projectId !== params.projectId),
              ...rows,
            ]);
          } else {
            this.items.set(rows);
          }
        }),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  getById(id: number): FollowUp | undefined {
    return this.items().find((f) => f.id === id);
  }

  get(id: number): Observable<FollowUp> {
    return this.http.get<FollowUp>(`${this.base}/${id}`).pipe(
      tap((row) => this.items.update((list) => upsertById(list, row))),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  getByCustomer(customerId: number): FollowUp[] {
    return this.items()
      .filter((f) => f.customerId === customerId)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }

  /** อ่าน isOverdue จาก API เป็นหลัก */
  isOverdue(f: FollowUp): boolean {
    return !!f.isOverdue;
  }

  daysUntilDue(f: FollowUp): number | null {
    if (typeof f.daysUntilDue === 'number' && Number.isFinite(f.daysUntilDue)) {
      return f.daysUntilDue;
    }
    return null;
  }

  listOverdue(): FollowUp[] {
    return this.items().filter((f) => this.isOverdue(f));
  }

  create(input: FollowUpCreateInput): Observable<FollowUp> {
    const hasProject = input.projectId != null && input.projectId > 0;
    const hasCustomer = input.customerId != null && input.customerId > 0;
    if (!input.title.trim() || !input.dueDate || (!hasProject && !hasCustomer)) {
      return throwError(() => new Error('กรุณากรอกหัวข้อ โปรเจกต์หรือลูกค้า และวันครบกำหนด'));
    }
    return this.http
      .post<FollowUp>(
        this.base,
        pruneUndefined({
          projectId: hasProject ? input.projectId : undefined,
          customerId: hasProject ? undefined : input.customerId,
          title: input.title.trim(),
          dueDate: input.dueDate,
          detail: input.detail?.trim() || undefined,
          assignedUserId: input.assignedUserId,
        })
      )
      .pipe(
        tap((row) => this.items.update((list) => upsertById(list, row))),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  update(id: number, input: FollowUpUpdateInput): Observable<FollowUp> {
    return this.http
      .patch<FollowUp>(
        `${this.base}/${id}`,
        pruneUndefined({
          title: input.title?.trim(),
          detail: input.detail === undefined ? undefined : input.detail?.trim() || null,
          dueDate: input.dueDate,
          status: input.status,
          assignedUserId: input.assignedUserId,
          resultNote:
            input.resultNote === undefined ? undefined : input.resultNote?.trim() || null,
          projectId: input.projectId,
        })
      )
      .pipe(
        tap((row) => this.items.update((list) => upsertById(list, row))),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  complete(id: number, input: FollowUpCompleteInput = {}): Observable<FollowUp> {
    return this.http
      .patch<FollowUp>(
        `${this.base}/${id}/complete`,
        pruneUndefined({
          resultNote: input.resultNote?.trim() || undefined,
        })
      )
      .pipe(
        tap((row) => this.items.update((list) => upsertById(list, row))),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  /** alias เดิม — ใช้ complete */
  markDone(id: number, resultNote?: string | null): Observable<FollowUp> {
    return this.complete(id, { resultNote });
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`).pipe(
      tap(() => this.items.update((list) => list.filter((f) => f.id !== id))),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }
}
