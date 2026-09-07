import { Injectable, computed, signal } from '@angular/core';
import { Observable, delay, of, throwError } from 'rxjs';
import { MaAddon, MaContract, MaContractStatus } from '../models/ma.model';

const CONTRACTS_KEY = 'cpams_mock_ma_contracts';
const ADDONS_KEY = 'cpams_mock_ma_addons';

const SEED_CONTRACTS: MaContract[] = [
  {
    id: 1,
    contractNo: 'MA-2026-001',
    customerId: 1,
    projectId: 1,
    planName: 'แผนมาตรฐาน (Gold)',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    status: 'ACTIVE',
    annualFee: 180000,
    quotaTotal: 24,
    quotaUsed: 5,
    slaHours: 8,
    note: 'รวม onsite 4 ครั้ง/ปี',
  },
  {
    id: 2,
    contractNo: 'MA-2026-002',
    customerId: 2,
    projectId: 2,
    planName: 'แผนพื้นฐาน (Silver)',
    startDate: '2026-03-01',
    endDate: '2027-02-28',
    status: 'ACTIVE',
    annualFee: 96000,
    quotaTotal: 12,
    quotaUsed: 11,
    slaHours: 24,
    note: 'โควตาใกล้หมด',
  },
  {
    id: 3,
    contractNo: 'MA-2025-008',
    customerId: 2,
    projectId: null,
    planName: 'แผนพื้นฐาน (Silver)',
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    status: 'EXPIRED',
    annualFee: 90000,
    quotaTotal: 12,
    quotaUsed: 12,
    slaHours: 24,
    note: 'สัญญาปีก่อน',
  },
];

const SEED_ADDONS: MaAddon[] = [
  {
    id: 1,
    contractId: 1,
    name: 'แพ็กโควตาเพิ่ม +6 เคส',
    quantity: 6,
    usedQuantity: 1,
    unitPrice: 15000,
    purchasedAt: '2026-06-15T09:00:00.000Z',
  },
  {
    id: 2,
    contractId: 1,
    name: 'Onsite ด่วนนอกเวลา',
    quantity: 2,
    usedQuantity: 0,
    unitPrice: 8000,
    purchasedAt: '2026-08-01T09:00:00.000Z',
  },
  {
    id: 3,
    contractId: 2,
    name: 'แพ็กโควตาเพิ่ม +3 เคส',
    quantity: 3,
    usedQuantity: 2,
    unitPrice: 9000,
    purchasedAt: '2026-07-20T09:00:00.000Z',
  },
];

export interface MaContractInput {
  customerId: number;
  projectId: number | null;
  planName: string;
  startDate: string;
  endDate: string;
  status: MaContractStatus;
  annualFee: number;
  quotaTotal: number;
  slaHours: number;
  note: string;
}

export interface MaAddonInput {
  name: string;
  quantity: number;
  unitPrice: number;
}

@Injectable({ providedIn: 'root' })
export class MaService {
  private readonly contractsSignal = signal<MaContract[]>(this.load(CONTRACTS_KEY, SEED_CONTRACTS));
  private readonly addonsSignal = signal<MaAddon[]>(this.load(ADDONS_KEY, SEED_ADDONS));
  private nextContractId = this.maxId(this.contractsSignal()) + 1;
  private nextAddonId = this.maxId(this.addonsSignal()) + 1;

  readonly contracts = this.contractsSignal.asReadonly();
  readonly addons = this.addonsSignal.asReadonly();
  readonly activeCount = computed(
    () => this.contractsSignal().filter((c) => c.status === 'ACTIVE').length
  );

  list(): Observable<MaContract[]> {
    return of(structuredClone(this.contractsSignal())).pipe(delay(180));
  }

  getById(id: number): MaContract | undefined {
    return this.contractsSignal().find((c) => c.id === id);
  }

  getByCustomer(customerId: number): MaContract[] {
    return this.contractsSignal().filter((c) => c.customerId === customerId);
  }

  getAddons(contractId: number): MaAddon[] {
    return this.addonsSignal().filter((a) => a.contractId === contractId);
  }

  remainingQuota(contract: MaContract): number {
    return Math.max(0, contract.quotaTotal - contract.quotaUsed);
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
    const row: MaContract = {
      id: this.nextContractId++,
      contractNo: `MA-${new Date().getFullYear()}-${String(this.nextContractId).padStart(3, '0')}`,
      customerId: input.customerId,
      projectId: input.projectId,
      planName: input.planName.trim(),
      startDate: input.startDate,
      endDate: input.endDate,
      status: input.status,
      annualFee: Number(input.annualFee) || 0,
      quotaTotal: Math.max(0, Number(input.quotaTotal) || 0),
      quotaUsed: 0,
      slaHours: Math.max(1, Number(input.slaHours) || 24),
      note: input.note.trim(),
    };
    this.contractsSignal.update((list) => {
      const next = [row, ...list];
      this.save(CONTRACTS_KEY, next);
      return next;
    });
    return of(structuredClone(row)).pipe(delay(220));
  }

  update(id: number, input: MaContractInput): Observable<MaContract> {
    const current = this.getById(id);
    if (!current) {
      return throwError(() => new Error('ไม่พบสัญญา MA'));
    }
    const updated: MaContract = {
      ...current,
      customerId: input.customerId,
      projectId: input.projectId,
      planName: input.planName.trim(),
      startDate: input.startDate,
      endDate: input.endDate,
      status: input.status,
      annualFee: Number(input.annualFee) || 0,
      quotaTotal: Math.max(current.quotaUsed, Number(input.quotaTotal) || 0),
      slaHours: Math.max(1, Number(input.slaHours) || 24),
      note: input.note.trim(),
    };
    this.contractsSignal.update((list) => {
      const next = list.map((c) => (c.id === id ? updated : c));
      this.save(CONTRACTS_KEY, next);
      return next;
    });
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
    this.addonsSignal.update((list) => {
      const next = [...list, row];
      this.save(ADDONS_KEY, next);
      return next;
    });
    return of(structuredClone(row)).pipe(delay(200));
  }

  /**
   * ใช้โควตา 1 เคสจากสัญญา ACTIVE ของลูกค้า
   * คืนสัญญาที่ถูกหัก หรือ error ถ้าโควตาไม่พอ
   */
  consumeQuota(customerId: number): Observable<MaContract> {
    const contract = this.findActiveWithQuota(customerId);
    if (!contract) {
      return throwError(() => new Error('ไม่พบสัญญา MA ที่ยังมีโควตาเหลือของลูกค้ารายนี้'));
    }
    const updated: MaContract = {
      ...contract,
      quotaUsed: contract.quotaUsed + 1,
    };
    this.contractsSignal.update((list) => {
      const next = list.map((c) => (c.id === contract.id ? updated : c));
      this.save(CONTRACTS_KEY, next);
      return next;
    });
    return of(structuredClone(updated)).pipe(delay(120));
  }

  /** ใช้ Add-on 1 หน่วยจากสัญญา (ชิ้นแรกที่ยังเหลือ) */
  consumeAddon(contractId: number): Observable<MaAddon> {
    const addon = this.getAddons(contractId).find((a) => a.usedQuantity < a.quantity);
    if (!addon) {
      return throwError(() => new Error('ไม่มี Add-on ที่ใช้ได้ในสัญญานี้'));
    }
    const updated: MaAddon = { ...addon, usedQuantity: addon.usedQuantity + 1 };
    this.addonsSignal.update((list) => {
      const next = list.map((a) => (a.id === addon.id ? updated : a));
      this.save(ADDONS_KEY, next);
      return next;
    });
    return of(structuredClone(updated)).pipe(delay(120));
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
