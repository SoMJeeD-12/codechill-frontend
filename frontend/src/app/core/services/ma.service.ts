import { Injectable, computed, signal } from '@angular/core';
import { Observable, delay, of, throwError } from 'rxjs';
import { MOCK_MA_PLANS, buildMockMaContracts } from '../mock/ma.mock';
import {
  MaAddon,
  MaContract,
  MaContractStatus,
  MaPlan,
  MaQuotaSummary,
} from '../models/ma.model';

/** CreateMaPlanDto (คาดการณ์) */
export interface MaPlanInput {
  code: string;
  name: string;
  description?: string | null;
  defaultAnnualFee: number;
  defaultQuotaTotal: number;
  defaultSlaHours: number;
  isActive?: boolean;
}

/** CreateMaContractDto / UpdateMaContractDto (คาดการณ์) */
export interface MaContractInput {
  customerId: number;
  projectId?: number | null;
  planId?: number | null;
  planName: string;
  startDate: string;
  endDate: string;
  status: MaContractStatus;
  annualFee: number;
  quotaTotal: number;
  slaHours: number;
  note?: string | null;
  contractNo?: string | null;
}

/** CreateMaAddonDto (คาดการณ์) */
export interface MaAddonInput {
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface MaContractListParams {
  customerId?: number;
  projectId?: number;
  status?: MaContractStatus;
  search?: string;
  page?: number;
  limit?: number;
}

/**
 * MA Phase 8 — ตอนนี้ใช้ mock ในหน่วยความจำ
 * เมื่อ backend พร้อม: เปลี่ยนเป็น HttpClient ตาม path ในคอมเมนต์ โดยหน้าจอแทบไม่ต้องแก้
 */
@Injectable({ providedIn: 'root' })
export class MaService {
  private readonly plansSignal = signal<MaPlan[]>(structuredClone(MOCK_MA_PLANS));
  private readonly contractsSignal = signal<MaContract[]>([]);
  private readonly addonsSignal = signal<MaAddon[]>([]);
  private nextPlanId = MOCK_MA_PLANS.length + 1;
  private nextContractId = 1;
  private nextAddonId = 1;
  private demoSeeded = false;

  readonly plans = this.plansSignal.asReadonly();
  readonly contracts = this.contractsSignal.asReadonly();
  readonly addons = this.addonsSignal.asReadonly();
  readonly activeCount = computed(
    () => this.contractsSignal().filter((c) => c.status === 'ACTIVE').length
  );

  /* ——— Plans → GET/POST /api/ma-plans ——— */

  listPlans(activeOnly = true): Observable<MaPlan[]> {
    const rows = this.plansSignal().filter((p) => (activeOnly ? p.isActive : true));
    return of(structuredClone(rows)).pipe(delay(120));
  }

  getPlan(id: number): MaPlan | undefined {
    return this.plansSignal().find((p) => p.id === id);
  }

  createPlan(input: MaPlanInput): Observable<MaPlan> {
    if (!input.code.trim() || !input.name.trim()) {
      return throwError(() => new Error('กรุณาระบุรหัสและชื่อแผน'));
    }
    const now = new Date().toISOString();
    const row: MaPlan = {
      id: this.nextPlanId++,
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      description: input.description?.trim() || null,
      defaultAnnualFee: Number(input.defaultAnnualFee) || 0,
      defaultQuotaTotal: Math.max(0, Number(input.defaultQuotaTotal) || 0),
      defaultSlaHours: Math.max(1, Number(input.defaultSlaHours) || 24),
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.plansSignal.update((list) => [row, ...list]);
    return of(structuredClone(row)).pipe(delay(180));
  }

  /* ——— Contracts → /api/ma-contracts ——— */

  list(params: MaContractListParams = {}): Observable<MaContract[]> {
    let rows = this.contractsSignal();
    if (params.customerId != null) {
      rows = rows.filter((c) => c.customerId === params.customerId);
    }
    if (params.projectId != null) {
      rows = rows.filter((c) => c.projectId === params.projectId);
    }
    if (params.status) {
      rows = rows.filter((c) => c.status === params.status);
    }
    if (params.search?.trim()) {
      const q = params.search.trim().toLowerCase();
      rows = rows.filter(
        (c) =>
          (c.contractNo ?? '').toLowerCase().includes(q) ||
          c.planName.toLowerCase().includes(q) ||
          (c.note ?? '').toLowerCase().includes(q)
      );
    }
    return of(structuredClone(rows)).pipe(delay(180));
  }

  getById(id: number): MaContract | undefined {
    return this.contractsSignal().find((c) => c.id === id);
  }

  /** GET /api/ma-contracts/:id — โครง Observable รอสลับเป็น HTTP */
  get(id: number): Observable<MaContract> {
    const row = this.getById(id);
    if (!row) {
      return throwError(() => new Error('ไม่พบสัญญา MA'));
    }
    return of(structuredClone(row)).pipe(delay(120));
  }

  getByCustomer(customerId: number): MaContract[] {
    return this.contractsSignal().filter((c) => c.customerId === customerId);
  }

  getAddons(contractId: number): MaAddon[] {
    return this.addonsSignal().filter((a) => a.contractId === contractId);
  }

  /** GET /api/ma-contracts/:id/addons */
  listAddons(contractId: number): Observable<MaAddon[]> {
    return of(structuredClone(this.getAddons(contractId))).pipe(delay(100));
  }

  remainingQuota(contract: MaContract): number {
    return Math.max(0, contract.quotaTotal - contract.quotaUsed);
  }

  quotaSummary(contract: MaContract): MaQuotaSummary {
    return {
      contractId: contract.id,
      quotaTotal: contract.quotaTotal,
      quotaUsed: contract.quotaUsed,
      remaining: this.remainingQuota(contract),
    };
  }

  /** สัญญา ACTIVE ของลูกค้าที่ยังมีโควตาเหลือ (เรียงโควตาเหลือน้อยก่อน) */
  findActiveWithQuota(customerId: number): MaContract | undefined {
    return this.contractsSignal()
      .filter((c) => c.customerId === customerId && c.status === 'ACTIVE')
      .filter((c) => this.remainingQuota(c) > 0)
      .sort((a, b) => this.remainingQuota(a) - this.remainingQuota(b))[0];
  }

  create(input: MaContractInput): Observable<MaContract> {
    if (!input.planName.trim() || !input.customerId || !input.startDate || !input.endDate) {
      return throwError(() => new Error('กรุณากรอกข้อมูลสัญญาให้ครบ'));
    }
    const now = new Date().toISOString();
    const plan = input.planId != null ? this.getPlan(input.planId) : undefined;
    const row: MaContract = {
      id: this.nextContractId++,
      contractNo:
        input.contractNo?.trim() ||
        `MA-${new Date().getFullYear()}-${String(this.nextContractId).padStart(3, '0')}`,
      customerId: input.customerId,
      projectId: input.projectId ?? null,
      planId: input.planId ?? plan?.id ?? null,
      planName: input.planName.trim() || plan?.name || 'ไม่ระบุแผน',
      startDate: input.startDate,
      endDate: input.endDate,
      status: input.status,
      annualFee: Number(input.annualFee) || 0,
      quotaTotal: Math.max(0, Number(input.quotaTotal) || 0),
      quotaUsed: 0,
      slaHours: Math.max(1, Number(input.slaHours) || 24),
      note: input.note?.trim() || null,
      createdAt: now,
      updatedAt: now,
    };
    this.contractsSignal.update((list) => [row, ...list]);
    return of(structuredClone(row)).pipe(delay(220));
  }

  update(id: number, input: MaContractInput): Observable<MaContract> {
    const current = this.getById(id);
    if (!current) {
      return throwError(() => new Error('ไม่พบสัญญา MA'));
    }
    const now = new Date().toISOString();
    const updated: MaContract = {
      ...current,
      customerId: input.customerId,
      projectId: input.projectId ?? null,
      planId: input.planId ?? current.planId,
      planName: input.planName.trim(),
      startDate: input.startDate,
      endDate: input.endDate,
      status: input.status,
      annualFee: Number(input.annualFee) || 0,
      quotaTotal: Math.max(current.quotaUsed, Number(input.quotaTotal) || 0),
      slaHours: Math.max(1, Number(input.slaHours) || 24),
      note: input.note?.trim() || null,
      contractNo: input.contractNo?.trim() || current.contractNo,
      updatedAt: now,
    };
    this.contractsSignal.update((list) => list.map((c) => (c.id === id ? updated : c)));
    return of(structuredClone(updated)).pipe(delay(200));
  }

  addAddon(contractId: number, input: MaAddonInput): Observable<MaAddon> {
    const contract = this.getById(contractId);
    if (!contract) {
      return throwError(() => new Error('ไม่พบสัญญา MA'));
    }
    if (!input.name.trim() || input.quantity < 1) {
      return throwError(() => new Error('กรุณาระบุชื่อและจำนวน Add-on'));
    }
    const row: MaAddon = {
      id: this.nextAddonId++,
      contractId,
      name: input.name.trim(),
      quantity: Math.floor(input.quantity),
      usedQuantity: 0,
      unitPrice: Number(input.unitPrice) || 0,
      purchasedAt: new Date().toISOString(),
    };
    this.addonsSignal.update((list) => [...list, row]);
    return of(structuredClone(row)).pipe(delay(200));
  }

  /**
   * ใช้โควตา 1 เคสจากสัญญา ACTIVE ของลูกค้า
   * รอ map กับ backend เมื่อเปิดใบแบบ MA_QUOTA
   */
  consumeQuota(customerId: number): Observable<MaContract> {
    const contract = this.findActiveWithQuota(customerId);
    if (!contract) {
      return throwError(() => new Error('ไม่พบสัญญา MA ที่ยังมีโควตาเหลือของลูกค้ารายนี้'));
    }
    const updated: MaContract = {
      ...contract,
      quotaUsed: contract.quotaUsed + 1,
      updatedAt: new Date().toISOString(),
    };
    this.contractsSignal.update((list) => list.map((c) => (c.id === contract.id ? updated : c)));
    return of(structuredClone(updated)).pipe(delay(120));
  }

  /** ใช้ Add-on 1 หน่วยจากสัญญา (ชิ้นแรกที่ยังเหลือ) */
  consumeAddon(contractId: number): Observable<MaAddon> {
    const addon = this.getAddons(contractId).find((a) => a.usedQuantity < a.quantity);
    if (!addon) {
      return throwError(() => new Error('ไม่มี Add-on ที่ใช้ได้ในสัญญานี้'));
    }
    const updated: MaAddon = { ...addon, usedQuantity: addon.usedQuantity + 1 };
    this.addonsSignal.update((list) => list.map((a) => (a.id === addon.id ? updated : a)));
    return of(structuredClone(updated)).pipe(delay(120));
  }

  /**
   * เติมข้อมูลตัวอย่างครั้งเดียวเมื่อมีลูกค้าจาก API แล้ว
   * ไม่ทับสัญญาที่ผู้ใช้สร้างเอง
   */
  ensureDemoSeed(customerId: number, projectIds: number[] = []): Observable<MaContract[]> {
    if (this.demoSeeded || this.contractsSignal().length > 0) {
      return this.list();
    }
    const { contracts, addons } = buildMockMaContracts({
      customerId,
      projectId: projectIds[0] ?? null,
      secondProjectId: projectIds[1] ?? null,
    });
    this.contractsSignal.set(contracts);
    this.addonsSignal.set(addons);
    this.nextContractId = Math.max(...contracts.map((c) => c.id)) + 1;
    this.nextAddonId = Math.max(...addons.map((a) => a.id), 0) + 1;
    this.demoSeeded = true;
    return of(structuredClone(contracts)).pipe(delay(160));
  }
}
