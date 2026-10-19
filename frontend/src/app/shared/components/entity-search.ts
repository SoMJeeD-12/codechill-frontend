import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { PROJECT_STATUS_LABELS, ProjectStatus } from '../../core/models/project.model';
import { CustomerService } from '../../core/services/customer.service';
import { ProjectService } from '../../core/services/project.service';
import { PickerOption } from './entity-picker.component';

/** จำนวนตัวเลือกต่อครั้งของดรอปดาวน์ที่ข้อมูลโตได้ */
export const PICKER_LIMIT = 20;

interface ProjectLike {
  id: number;
  code?: string | null;
  name: string;
  status?: string | null;
}

interface CustomerLike {
  id: number;
  code?: string | null;
  name: string;
  phone?: string | null;
}

/** 「รหัส · ชื่อ」 + ป้ายสถานะเมื่อไม่ใช่ IN_PROGRESS */
export function projectPickerOption(p: ProjectLike): PickerOption {
  const status = p.status ?? null;
  return {
    id: p.id,
    label: p.name,
    code: p.code ?? null,
    badge:
      status && status !== 'IN_PROGRESS'
        ? PROJECT_STATUS_LABELS[status as ProjectStatus] ?? status
        : null,
  };
}

export function projectPickerOptionOrNull(p: ProjectLike | null | undefined): PickerOption | null {
  return p ? projectPickerOption(p) : null;
}

export function customerPickerOption(c: CustomerLike): PickerOption {
  return {
    id: c.id,
    label: c.name,
    code: c.code ?? null,
    meta: c.phone?.trim() || null,
  };
}

/**
 * GET /projects/options?search=&limit=20 — ว่าง = รายการแรก (ใช้กับ openOnFocus)
 */
export function projectSearchFn(
  api: ProjectService,
  limit = PICKER_LIMIT
): (query: string) => Observable<PickerOption[]> {
  return (query) =>
    api.listProjectOptions({ search: query.trim() || undefined, limit }).pipe(
      map((rows) => rows.map(projectPickerOption)),
      catchError(() => of([] as PickerOption[]))
    );
}

/** GET /customers?search=&limit=20 */
export function customerSearchFn(
  api: CustomerService,
  limit = PICKER_LIMIT
): (query: string) => Observable<PickerOption[]> {
  return (query) =>
    api.searchCustomers({ search: query.trim() || undefined, limit }).pipe(
      map((rows) => rows.map(customerPickerOption)),
      catchError(() => of([] as PickerOption[]))
    );
}
