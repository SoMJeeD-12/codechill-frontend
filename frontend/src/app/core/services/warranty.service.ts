import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { apiErrorMessage } from '../http/api-error';
import { asList, asPage, pruneUndefined, toHttpParams, upsertById } from '../http/api.util';
import {
  WARRANTY_NEAR_EXPIRY_DAYS,
  Warranty,
  WarrantyEditableStatus,
  WarrantyPrintPayload,
} from '../models/warranty.model';
export interface WarrantyListParams {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  projectId?: number;
  customerId?: number;
  /** startDate | endDate | durationMonth | createdAt */
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

/** CreateWarrantyDto */
export interface WarrantyCreateInput {
  durationMonth: number;
  scopeNote?: string | null;
  /** ไม่บังคับ — สัญญาต้องเป็นของโปรเจกต์เดียวกับใบส่งมอบ */
  maContractId?: number | null;
}

/** UpdateWarrantyDto — ส่ง `maContractId: null` เพื่อถอดการผูก · ไม่ส่งฟิลด์ = คงค่าเดิม */
export interface WarrantyUpdateInput {
  durationMonth?: number;
  /** ไม่ส่ง = ไม่เปลี่ยนสถานะ */
  status?: WarrantyEditableStatus;
  scopeNote?: string | null;
  maContractId?: number | null;
}

@Injectable({ providedIn: 'root' })
export class WarrantyService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/warranties`;
  private readonly items = signal<Warranty[]>([]);

  readonly warranties = this.items.asReadonly();
  readonly nearExpiryCount = computed(
    () => this.listNearExpiry(WARRANTY_NEAR_EXPIRY_DAYS).length
  );

  /** GET /warranties แบ่งหน้าฝั่ง server — ยังคุ้มครองไหมให้อ่าน `isCurrentlyActive` ไม่ใช่ `status` */
  listPage(params: WarrantyListParams): Observable<{ items: Warranty[]; total: number }> {
    return this.http
      .get<Warranty[] | { items: Warranty[]; total?: number }>(this.base, {
        params: toHttpParams({ ...params }),
      })
      .pipe(
        map((body) => {
          const page = asPage<Warranty>(body);
          return { items: page.items.map((row) => this.normalize(row)), total: page.total };
        }),
        tap((page) =>
          this.items.update((all) => page.items.reduce((acc, row) => upsertById(acc, row), all))
        ),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  /** GET /warranties/expiring แบบแบ่งหน้า — ไม่ทับ cache ทั้งก้อน */
  listExpiringPage(params: {
    days?: number;
    search?: string;
    page: number;
    limit: number;
  }): Observable<{ items: Warranty[]; total: number }> {
    return this.http
      .get<Warranty[] | { items: Warranty[]; total?: number }>(`${this.base}/expiring`, {
        params: toHttpParams({ days: WARRANTY_NEAR_EXPIRY_DAYS, ...params }),
      })
      .pipe(
        map((body) => {
          const page = asPage<Warranty>(body);
          return { items: page.items.map((row) => this.normalize(row)), total: page.total };
        }),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  listByProject(projectId: number, syncCache = true): Observable<Warranty[]> {
    return this.http
      .get<Warranty[] | { items: Warranty[] }>(
        `${environment.apiBaseUrl}/projects/${projectId}/warranties`
      )
      .pipe(
        map((body) => asList(body).map((row) => this.normalize(row))),
        tap((rows) => {
          if (!syncCache) {
            return;
          }
          this.items.update((all) => [
            ...all.filter((w) => w.projectId !== projectId),
            ...rows,
          ]);
        }),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  listExpiring(params?: {
    days?: number;
    customerId?: number;
    search?: string;
    page?: number;
    limit?: number;
  }): Observable<Warranty[]> {
    return this.http
      .get<Warranty[] | { items: Warranty[] }>(`${this.base}/expiring`, {
        params: toHttpParams({
          days: params?.days ?? WARRANTY_NEAR_EXPIRY_DAYS,
          customerId: params?.customerId,
          search: params?.search,
          page: params?.page,
          limit: params?.limit ?? 100,
        }),
      })
      .pipe(
        map((body) => asList(body).map((row) => this.normalize(row))),
        tap((rows) => {
          this.items.update((all) => {
            let next = [...all];
            for (const row of rows) {
              next = upsertById(next, row);
            }
            return next;
          });
        }),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  /** GET /warranties/:id — มี attachments[] */
  fetchDetail(id: number): Observable<Warranty> {
    return this.http.get<Warranty>(`${this.base}/${id}`).pipe(
      map((row) => this.normalize(row)),
      tap((row) => this.items.update((list) => upsertById(list, row))),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  /** GET /warranties/:id/print — ข้อมูลสำหรับจัดหน้าใบรับประกัน */
  getPrint(id: number): Observable<WarrantyPrintPayload> {
    return this.http
      .get<WarrantyPrintPayload>(`${this.base}/${id}/print`)
      .pipe(catchError((err) => throwError(() => new Error(apiErrorMessage(err)))));
  }

  getById(id: number): Warranty | undefined {
    return this.items().find((w) => w.id === id);
  }

  getByCustomer(customerId: number): Warranty[] {
    return this.items().filter(
      (w) => w.project?.customerId === customerId || this.customerIdOf(w) === customerId
    );
  }

  /** จาก cache — ใช้หลัง list/listExpiring แล้ว */
  listNearExpiry(withinDays = WARRANTY_NEAR_EXPIRY_DAYS): Warranty[] {
    return this.items().filter((w) => {
      if (w.status !== 'ACTIVE' && !w.isCurrentlyActive) {
        return false;
      }
      const days = this.daysUntilExpiry(w);
      return days !== null && days >= 0 && days <= withinDays;
    });
  }

  daysUntilExpiry(w: Warranty): number | null {
    if (typeof w.daysRemaining === 'number' && Number.isFinite(w.daysRemaining)) {
      return w.daysRemaining;
    }
    return null;
  }

  createForDelivery(deliveryId: number, input: WarrantyCreateInput): Observable<Warranty> {
    if (!input.durationMonth || input.durationMonth < 1) {
      return throwError(() => new Error('กรุณาระบุระยะประกันเป็นเดือน'));
    }
    return this.http
      .post<Warranty>(
        `${environment.apiBaseUrl}/deliveries/${deliveryId}/warranties`,
        pruneUndefined({
          durationMonth: input.durationMonth,
          scopeNote: input.scopeNote?.trim() || undefined,
          maContractId: input.maContractId ?? undefined,
        })
      )
      .pipe(
        map((row) => this.normalize(row)),
        tap((row) => this.items.update((list) => upsertById(list, row))),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  update(id: number, input: WarrantyUpdateInput): Observable<Warranty> {
    return this.http
      .put<Warranty>(`${this.base}/${id}`, pruneUndefined(input))
      .pipe(
        map((row) => this.normalize(row)),
        tap((row) => this.items.update((list) => upsertById(list, row))),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  private normalize(
    row: Warranty & {
      warrantyNo?: string | null;
      code?: string | null;
      warrantyCode?: string | null;
    }
  ): Warranty {
    const { code: _ignoredCode, warrantyCode: _ignoredLegacy, ...rest } = row;
    return {
      ...rest,
      warrantyNo: pickWarrantyNo(row),
      scopeNote: row.scopeNote ?? null,
      maContractId: row.maContractId ?? null,
      maContract: row.maContract ?? null,
      attachments: Array.isArray(row.attachments) ? row.attachments : [],
      delivery: row.delivery ?? null,
      project: row.project ?? null,
    };
  }

  private customerIdOf(w: Warranty): number | null {
    return w.project?.customerId ?? null;
  }
}

/** อ่านเฉพาะ warrantyNo — ห้ามใช้ warranty.code (ไม่มีใน BE) */
function pickWarrantyNo(row: {
  warrantyNo?: string | null;
}): string | null {
  const value = row.warrantyNo;
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return null;
}
