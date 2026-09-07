import { Injectable, computed, signal } from '@angular/core';
import { Observable, delay, of, throwError } from 'rxjs';
import {
  WARRANTY_NEAR_EXPIRY_DAYS,
  Warranty,
  WarrantyCoverage,
  WarrantyStatus,
} from '../models/warranty.model';
import { parseDateOnly, toDateOnlyString } from '../utils/date.util';

const KEY = 'cpams_mock_warranties';

const SEED: Warranty[] = [
  {
    id: 1,
    customerId: 1,
    projectId: 1,
    deliveryId: 1,
    title: 'ประกันแดชบอร์ด IoT หลังส่งมอบ v0.9',
    coverage: 'SOFTWARE',
    startDate: '2026-07-01',
    endDate: '2027-07-01',
    status: 'ACTIVE',
    note: 'ครอบคลุมบั๊กซอฟต์แวร์และแพตช์ความปลอดภัย',
  },
  {
    id: 2,
    customerId: 1,
    projectId: 1,
    deliveryId: null,
    title: 'ประกัน Gateway / เซ็นเซอร์ชุดติดตั้ง',
    coverage: 'HARDWARE',
    startDate: '2026-05-15',
    endDate: '2026-09-20',
    status: 'ACTIVE',
    note: 'ใกล้หมดอายุ — ควรเสนอต่อสัญญา MA',
  },
  {
    id: 3,
    customerId: 2,
    projectId: 2,
    deliveryId: null,
    title: 'ประกันแอปแจ้งซ่อม',
    coverage: 'SOFTWARE',
    startDate: '2026-04-01',
    endDate: '2026-09-15',
    status: 'ACTIVE',
    note: '',
  },
  {
    id: 4,
    customerId: 2,
    projectId: 2,
    deliveryId: null,
    title: 'ประกันรอบทดสอบเก่า',
    coverage: 'BOTH',
    startDate: '2025-01-01',
    endDate: '2026-01-01',
    status: 'EXPIRED',
    note: 'หมดอายุแล้ว',
  },
];

export interface WarrantyInput {
  customerId: number;
  projectId: number | null;
  deliveryId: number | null;
  title: string;
  coverage: WarrantyCoverage;
  startDate: string;
  endDate: string;
  status: WarrantyStatus;
  note: string;
}

@Injectable({ providedIn: 'root' })
export class WarrantyService {
  private readonly items = signal<Warranty[]>(this.load());
  private nextId = this.maxId(this.items()) + 1;

  readonly warranties = this.items.asReadonly();
  readonly nearExpiryCount = computed(
    () => this.listNearExpiry(WARRANTY_NEAR_EXPIRY_DAYS).length
  );

  list(): Observable<Warranty[]> {
    return of(structuredClone(this.items())).pipe(delay(180));
  }

  getById(id: number): Warranty | undefined {
    return this.items().find((w) => w.id === id);
  }

  getByCustomer(customerId: number): Warranty[] {
    return this.items().filter((w) => w.customerId === customerId);
  }

  /** ACTIVE ที่ endDate อยู่ในช่วง N วันข้างหน้า (รวมวันนี้) */
  listNearExpiry(withinDays = WARRANTY_NEAR_EXPIRY_DAYS): Warranty[] {
    const today = parseDateOnly(toDateOnlyString(new Date()))!;
    const limit = new Date(today);
    limit.setDate(limit.getDate() + withinDays);

    return this.items().filter((w) => {
      if (w.status !== 'ACTIVE') {
        return false;
      }
      const end = parseDateOnly(w.endDate);
      if (!end) {
        return false;
      }
      return end >= today && end <= limit;
    });
  }

  daysUntilExpiry(w: Warranty): number | null {
    const today = parseDateOnly(toDateOnlyString(new Date()));
    const end = parseDateOnly(w.endDate);
    if (!today || !end) {
      return null;
    }
    return Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }

  create(input: WarrantyInput): Observable<Warranty> {
    if (!input.title.trim() || !input.customerId || !input.startDate || !input.endDate) {
      return throwError(() => new Error('กรุณากรอกข้อมูลประกันให้ครบ'));
    }
    if (input.endDate < input.startDate) {
      return throwError(() => new Error('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม'));
    }
    const row: Warranty = {
      id: this.nextId++,
      customerId: input.customerId,
      projectId: input.projectId,
      deliveryId: input.deliveryId,
      title: input.title.trim(),
      coverage: input.coverage,
      startDate: input.startDate,
      endDate: input.endDate,
      status: input.status,
      note: input.note.trim(),
    };
    this.items.update((list) => {
      const next = [row, ...list];
      this.save(next);
      return next;
    });
    return of(structuredClone(row)).pipe(delay(220));
  }

  update(id: number, input: WarrantyInput): Observable<Warranty> {
    const current = this.getById(id);
    if (!current) {
      return throwError(() => new Error('ไม่พบรายการประกัน'));
    }
    if (!input.title.trim() || !input.customerId || !input.startDate || !input.endDate) {
      return throwError(() => new Error('กรุณากรอกข้อมูลประกันให้ครบ'));
    }
    const updated: Warranty = {
      ...current,
      customerId: input.customerId,
      projectId: input.projectId,
      deliveryId: input.deliveryId,
      title: input.title.trim(),
      coverage: input.coverage,
      startDate: input.startDate,
      endDate: input.endDate,
      status: input.status,
      note: input.note.trim(),
    };
    this.items.update((list) => {
      const next = list.map((w) => (w.id === id ? updated : w));
      this.save(next);
      return next;
    });
    return of(structuredClone(updated)).pipe(delay(200));
  }

  private load(): Warranty[] {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        return JSON.parse(raw) as Warranty[];
      }
    } catch {
      /* ignore */
    }
    const data = structuredClone(SEED);
    this.save(data);
    return data;
  }

  private save(data: Warranty[]): void {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  private maxId(items: { id: number }[]): number {
    return items.reduce((max, i) => Math.max(max, i.id), 0);
  }
}
