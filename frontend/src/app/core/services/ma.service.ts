import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { ApiEnvelopeService } from '../http/api-envelope.service';
import { apiErrorMessage } from '../http/api-error';
import { asList, asPage, pruneUndefined, toHttpParams, upsertById } from '../http/api.util';
import {
  MaAddon,
  MaAddonType,
  MaBillingCycle,
  MaContract,
  MaContractStatus,
  MaEditableStatus,
  MaPlan,
  MaQuotaStatus,
} from '../models/ma.model';

/** CreateMaPlanDto — ห้ามส่ง price · code ไม่บังคับแล้ว */
export interface MaPlanInput {
  code?: string | null;
  name: string;
  description?: string | null;
  bugQuotaPerMonth?: number;
  responseTimeHour?: number | null;
  onsiteQuotaPerMonth?: number | null;
  isActive?: boolean;
  sortOrder?: number;
  items?: Array<{ title: string; detail?: string | null }>;
}

/** UpdateMaPlanDto — ส่ง items = แทนที่ทั้งชุด */
export interface MaPlanUpdateInput extends Partial<MaPlanInput> {}

/** CreateMaContractDto — ไม่ส่ง customerId (backend ดึงจาก project) · contractNo ออกโดย BE */
export interface MaContractCreateInput {
  projectId: number;
  planId: number;
  price: string;
  startDate: string;
  endDate: string;
  billingCycle?: MaBillingCycle;
  status?: MaEditableStatus;
  signedDate?: string | null;
  signedFileUrl?: string | null;
  note?: string | null;
}

/** UpdateMaContractDto — ไม่มี RENEWED / ไม่ย้าย project · ห้ามส่ง contractNo */
export interface MaContractUpdateInput {
  planId?: number;
  price?: string;
  billingCycle?: MaBillingCycle;
  startDate?: string;
  endDate?: string;
  /** ไม่ส่ง = ไม่เปลี่ยนสถานะ (สัญญาหมดอายุ/ต่อแล้ว ห้ามส่งค่าเดิมกลับ) */
  status?: MaEditableStatus;
  signedDate?: string | null;
  signedFileUrl?: string | null;
  note?: string | null;
}

export interface MaContractRenewInput {
  startDate: string;
  endDate: string;
  price: string;
  planId?: number;
  billingCycle?: MaBillingCycle;
  note?: string | null;
}

export interface MaAddonInput {
  title: string;
  addonType?: MaAddonType;
  extraQuota?: number;
  price?: string;
  /** ส่งคู่กัน หรือไม่ส่งทั้งคู่ */
  effectiveYear?: number | null;
  effectiveMonth?: number | null;
  note?: string | null;
}

/** UpdateMaAddonDto — partial ของ Create */
export type MaAddonUpdateInput = Partial<MaAddonInput>;

export interface MaContractListParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  customerId?: number;
  projectId?: number;
  status?: MaContractStatus;
  expiringInDays?: number;
}

export interface MaPlanListParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  isActive?: boolean;
}

@Injectable({ providedIn: 'root' })
export class MaService {
  private readonly http = inject(HttpClient);
  private readonly envelope = inject(ApiEnvelopeService);
  private readonly plansBase = `${environment.apiBaseUrl}/ma-plans`;
  private readonly contractsBase = `${environment.apiBaseUrl}/ma-contracts`;

  private readonly plansSignal = signal<MaPlan[]>([]);
  private readonly contractsSignal = signal<MaContract[]>([]);

  readonly plans = this.plansSignal.asReadonly();
  readonly contracts = this.contractsSignal.asReadonly();
  readonly activeCount = computed(
    () => this.contractsSignal().filter((c) => c.isCurrentlyActive).length
  );

  /* ——— Plans ——— */

  listPlans(params: MaPlanListParams | boolean = { isActive: true }): Observable<MaPlan[]> {
    const query: MaPlanListParams =
      typeof params === 'boolean' ? { isActive: params ? true : undefined, limit: 100 } : params;
    return this.http
      .get<MaPlan[] | { items: MaPlan[] }>(this.plansBase, {
        params: toHttpParams({ limit: 100, ...query }),
      })
      .pipe(
        map(asList),
        tap((list) => this.plansSignal.set(list)),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  getPlan(id: number): MaPlan | undefined {
    return this.plansSignal().find((p) => p.id === id);
  }

  getPlanById(id: number): Observable<MaPlan> {
    return this.http.get<MaPlan>(`${this.plansBase}/${id}`).pipe(
      tap((plan) => this.plansSignal.update((list) => upsertById(list, plan))),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  createPlan(input: MaPlanInput): Observable<MaPlan> {
    return this.http.post<MaPlan>(this.plansBase, pruneUndefined(input)).pipe(
      tap((plan) => this.plansSignal.update((list) => upsertById(list, plan))),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  updatePlan(id: number, input: MaPlanUpdateInput): Observable<MaPlan> {
    return this.http.patch<MaPlan>(`${this.plansBase}/${id}`, pruneUndefined(input)).pipe(
      tap((plan) => this.plansSignal.update((list) => upsertById(list, plan))),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  deletePlan(id: number): Observable<void> {
    return this.http.delete<void>(`${this.plansBase}/${id}`).pipe(
      tap(() => this.plansSignal.update((list) => list.filter((p) => p.id !== id))),
      catchError((err) => {
        const error = new Error(apiErrorMessage(err)) as Error & { status?: number };
        if (err instanceof HttpErrorResponse) {
          error.status = err.status;
        }
        return throwError(() => error);
      })
    );
  }

  /* ——— Contracts ——— */

  /**
   * GET /ma-contracts?expiringInDays= — ไม่เขียนทับ cache รายการสัญญาทั้งก้อน
   * (list() จะ set cache เป็นผลลัพธ์ที่กรองแล้ว)
   */
  listExpiring(days: number, limit = 100): Observable<MaContract[]> {
    return this.http
      .get<MaContract[] | { items: MaContract[] }>(this.contractsBase, {
        params: toHttpParams({ limit, expiringInDays: days }),
      })
      .pipe(
        map(asList),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  list(params: MaContractListParams = {}): Observable<MaContract[]> {
    return this.http
      .get<MaContract[] | { items: MaContract[] }>(this.contractsBase, {
        params: toHttpParams({ limit: 100, ...params }),
      })
      .pipe(
        map(asList),
        tap((list) => this.contractsSignal.set(list)),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  /** GET /ma-contracts แบ่งหน้าฝั่ง server — ไม่เขียนทับ cache รายการทั้งก้อน */
  listPage(
    params: Omit<MaContractListParams, 'sortOrder'> & { sortOrder?: 'ASC' | 'DESC' }
  ): Observable<{ items: MaContract[]; total: number }> {
    return this.http
      .get<MaContract[] | { items: MaContract[] }>(this.contractsBase, {
        params: toHttpParams({ ...params }),
      })
      .pipe(
        map((body) => asPage<MaContract>(body)),
        tap((page) =>
          this.contractsSignal.update((list) =>
            page.items.reduce((acc, row) => upsertById(acc, row), list)
          )
        ),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  getById(id: number): MaContract | undefined {
    return this.contractsSignal().find((c) => c.id === id);
  }

  get(id: number): Observable<MaContract> {
    return this.http.get<MaContract>(`${this.contractsBase}/${id}`).pipe(
      tap((row) => this.contractsSignal.update((list) => upsertById(list, row))),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  getByCustomer(customerId: number): MaContract[] {
    return this.contractsSignal().filter((c) => c.customerId === customerId);
  }

  getQuota(contractId: number, onDate?: string): Observable<MaQuotaStatus> {
    return this.http
      .get<MaQuotaStatus>(`${this.contractsBase}/${contractId}/quota`, {
        params: toHttpParams({ onDate }),
      })
      .pipe(catchError((err) => throwError(() => new Error(apiErrorMessage(err)))));
  }

  listAddons(contractId: number): Observable<MaAddon[]> {
    return this.http
      .get<MaAddon[] | { items: MaAddon[] }>(`${this.contractsBase}/${contractId}/addons`)
      .pipe(
        map(asList),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  remainingQuota(contract: MaContract): number | null {
    return contract.quota?.remaining ?? null;
  }

  create(input: MaContractCreateInput): Observable<{ contract: MaContract; message: string | null }> {
    this.envelope.takeMessage();
    return this.http.post<MaContract>(this.contractsBase, pruneUndefined(input)).pipe(
      map((contract) => {
        this.contractsSignal.update((list) => upsertById(list, contract));
        return { contract, message: this.envelope.takeMessage() };
      }),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  update(
    id: number,
    input: MaContractUpdateInput
  ): Observable<{ contract: MaContract; message: string | null }> {
    this.envelope.takeMessage();
    return this.http
      .patch<MaContract>(`${this.contractsBase}/${id}`, pruneUndefined(input))
      .pipe(
        map((contract) => {
          this.contractsSignal.update((list) => upsertById(list, contract));
          return { contract, message: this.envelope.takeMessage() };
        }),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  renew(id: number, input: MaContractRenewInput): Observable<MaContract> {
    return this.http
      .post<MaContract>(`${this.contractsBase}/${id}/renew`, pruneUndefined(input))
      .pipe(
        tap((row) => this.contractsSignal.update((list) => upsertById(list, row))),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  addAddon(contractId: number, input: MaAddonInput): Observable<MaAddon> {
    return this.http
      .post<MaAddon>(`${this.contractsBase}/${contractId}/addons`, pruneUndefined(input))
      .pipe(catchError((err) => throwError(() => new Error(apiErrorMessage(err)))));
  }

  /** Add-on แก้/ลบไม่ได้ตามสัญญา API — เพิ่มได้อย่างเดียว */
  updateAddon(
    _contractId: number,
    _addonId: number,
    _input: MaAddonUpdateInput
  ): Observable<MaAddon> {
    return throwError(() => new Error('ระบบไม่รองรับการแก้ไข Add-on'));
  }

  deleteAddon(_contractId: number, _addonId: number): Observable<void> {
    return throwError(() => new Error('ระบบไม่รองรับการลบ Add-on'));
  }

  /** GET /ma-contracts/:id/print — ข้อมูลร่างสัญญาให้ FE จัดหน้าพิมพ์ */
  getPrintPayload(contractId: number): Observable<MaContractPrintPayload> {
    return this.http
      .get<MaContractPrintPayload>(`${this.contractsBase}/${contractId}/print`)
      .pipe(catchError((err) => throwError(() => new Error(apiErrorMessage(err)))));
  }
}

/** ข้อมูลจาก GET .../print */
export interface MaContractPrintPayload {
  generatedAt: string;
  contract: {
    id: number;
    contractNo: string | null;
    status: MaContractStatus;
    price: string;
    billingCycle: MaBillingCycle;
    startDate: string;
    endDate: string;
    signedDate: string | null;
    note: string | null;
    previousContract?: {
      id: number;
      contractNo: string | null;
      startDate?: string;
      endDate?: string;
    } | null;
  };
  customer: {
    id: number;
    code: string | null;
    name: string;
    taxId: string | null;
    address: string | null;
    province: string | null;
    postalCode: string | null;
    phone: string | null;
    email: string | null;
  };
  /** ไม่มีผู้ติดต่อหลัก = null — ห้ามหยิบผู้ติดต่อคนแรกมาแทน */
  primaryContact: {
    id?: number;
    name: string;
    position?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
  project: { id: number; code?: string | null; name: string };
  plan: {
    code: string | null;
    name: string;
    description: string | null;
    bugQuotaPerMonth: number;
    responseTimeHour: number | null;
    onsiteQuotaPerMonth: number | null;
    items: Array<{ title: string; detail: string | null; sortOrder?: number }>;
  };
  addons: MaAddon[];
}
