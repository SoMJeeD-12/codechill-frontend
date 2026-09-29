import { HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

/** เพดาน limit ของ backend ทุก endpoint รายการ */
export const API_LIST_MAX_LIMIT = 100;

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

/** response แบบ cursor — total เป็น null ในหน้าที่ส่ง cursor ไป */
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number | null;
}

export function asCursorPage<T>(
  body:
    | T[]
    | { items?: T[]; total?: number | null; nextCursor?: string | null; hasMore?: boolean }
    | null
    | undefined
): CursorPage<T> {
  if (!body) {
    return { items: [], nextCursor: null, hasMore: false, total: 0 };
  }
  if (Array.isArray(body)) {
    return { items: body, nextCursor: null, hasMore: false, total: body.length };
  }
  const items = Array.isArray(body.items) ? body.items : [];
  const nextCursor = typeof body.nextCursor === 'string' && body.nextCursor ? body.nextCursor : null;
  return {
    items,
    nextCursor,
    hasMore: !!nextCursor && body.hasMore !== false,
    total: typeof body.total === 'number' ? body.total : null,
  };
}

/**
 * ดึงรายการครบทุกหน้า — ยิงทีละไม่เกิน API_LIST_MAX_LIMIT
 * หยุดเมื่อ items รวม ≥ total หรือหน้าล่าสุดว่าง/สั้นกว่า limit
 */
export function fetchAllPages<T>(
  fetchPage: (page: number, limit: number) => Observable<{ items: T[]; total: number }>,
  limit = API_LIST_MAX_LIMIT
): Observable<T[]> {
  const pageSize = Math.min(Math.max(1, limit), API_LIST_MAX_LIMIT);
  const load = (page: number, acc: T[]): Observable<T[]> =>
    fetchPage(page, pageSize).pipe(
      switchMap(({ items, total }) => {
        const next = acc.concat(items);
        if (items.length === 0 || next.length >= total || items.length < pageSize) {
          return of(next);
        }
        return load(page + 1, next);
      })
    );
  return load(1, []);
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
