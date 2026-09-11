import { HttpParams } from '@angular/common/http';

export interface Paginated<T> {
  items: T[];
  total?: number;
  page?: number;
  limit?: number;
}

/** รองรับทั้ง array ตรง ๆ และรูปแบ่งหน้าหลัง unwrap */
export function asList<T>(body: T[] | Paginated<T> | { items: T[] } | null | undefined): T[] {
  if (!body) {
    return [];
  }
  if (Array.isArray(body)) {
    return body;
  }
  return Array.isArray(body.items) ? body.items : [];
}

/** ดึง items + total จาก response แบบแบ่งหน้า */
export function asPage<T>(
  body: T[] | Paginated<T> | { items: T[]; total?: number } | null | undefined
): { items: T[]; total: number } {
  if (!body) {
    return { items: [], total: 0 };
  }
  if (Array.isArray(body)) {
    return { items: body, total: body.length };
  }
  const items = Array.isArray(body.items) ? body.items : [];
  return { items, total: typeof body.total === 'number' ? body.total : items.length };
}

/** สร้าง query string โดยตัด null/undefined/'' ออก */
export function toHttpParams(
  source: Record<string, string | number | boolean | null | undefined>
): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(source)) {
    if (value == null || value === '') {
      continue;
    }
    params = params.set(key, String(value));
  }
  return params;
}

/** ตัด key ที่เป็น undefined ออกก่อนส่ง body (DTO ฝั่ง API เป็น optional) */
export function pruneUndefined<T extends object>(body: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(body).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}

export function upsertById<T extends { id: number }>(list: T[], row: T): T[] {
  const idx = list.findIndex((x) => x.id === row.id);
  if (idx < 0) {
    return [row, ...list];
  }
  const next = [...list];
  next[idx] = row;
  return next;
}
