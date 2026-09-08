import { Injectable, computed, signal } from '@angular/core';
import { Observable, delay, of, throwError } from 'rxjs';
import {
  WARRANTY_NEAR_EXPIRY_DAYS,
  Warranty,
  WarrantyCoverage,
  WarrantyStatus,
} from '../models/warranty.model';
import { parseDateOnly, toDateOnlyString } from '../utils/date.util';

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
  private readonly items = signal<Warranty[]>([]);
  private nextId = 1;

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
    this.items.update((list) => [row, ...list]);
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
    this.items.update((list) => list.map((w) => (w.id === id ? updated : w)));
    return of(structuredClone(updated)).pipe(delay(200));
  }
}
