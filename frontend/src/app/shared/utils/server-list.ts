import { DestroyRef, Signal, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';
import { PageEvent } from '@angular/material/paginator';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { Observable, Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, switchMap } from 'rxjs/operators';
import { DEFAULT_PAGE_SIZE_OPTIONS } from './client-pager';

export type SortOrder = 'ASC' | 'DESC';
export type ListFilterValue = string | number | boolean | null;

export interface ListPage<T> {
  items: T[];
  total: number;
}

export interface ListRequest<F> {
  page: number;
  limit: number;
  search?: string;
  sortBy?: string;
  sortOrder?: SortOrder;
  filters: F;
}

interface CacheEntry {
  page: ListPage<unknown>;
  at: number;
}

const CACHE_MAX = 80;
const cache = new Map<string, CacheEntry>();

/** ล้าง cache ของรายการ — เรียกหลังสร้าง/แก้/ลบ (เช่น invalidateListCache('projects')) */
export function invalidateListCache(namespace: string): void {
  const prefix = `${namespace}?`;
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

function putCache(key: string, page: ListPage<unknown>): void {
  cache.delete(key);
  cache.set(key, { page, at: Date.now() });
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    cache.delete(oldest);
  }
}

export interface ServerListOptions<T, F extends Record<string, ListFilterValue>> {
  /** ชื่อ cache เช่น 'projects' — ใช้กับ invalidateListCache */
  namespace: string;
  fetch: (req: ListRequest<F>) => Observable<ListPage<T>>;
  /** ค่าเริ่มต้นของตัวกรอง — key ต้องเป็นชื่อ query param ที่ต้องการเก็บใน URL */
  filters: F;
  sortBy?: string | null;
  sortOrder?: SortOrder;
  /** ลำดับเริ่มต้นเมื่อกดคอลัมน์ใหม่ */
  sortOrderFor?: (key: string) => SortOrder;
  pageSize?: number;
  pageSizeOptions?: readonly number[];
  /** false = ไม่เขียน/อ่าน query params (เช่น ตารางในแท็บของหน้ารายละเอียด) */
  syncUrl?: boolean;
  searchDebounceMs?: number;
}

/**
 * ตารางแบ่งหน้าฝั่ง server แบบกลาง
 * - โหลดใหม่คงแถวเดิมไว้ + แถบโหลดบาง ๆ · ครั้งแรกโชว์ skeleton (`initialLoading`)
 * - ค้นหา debounce 300ms + distinctUntilChanged + switchMap (ยกเลิกคำขอเก่า)
 * - page / limit / q / sort / order / ตัวกรอง เก็บใน URL — กลับจากหน้ารายละเอียดได้หน้าเดิม
 * - prefetch หน้าถัดไปเมื่อ page*limit < total
 * - stale-while-revalidate ต่อ URL · เปลี่ยนตัวกรอง/คำค้น → กลับหน้า 1
 * ต้องเรียกใน injection context (field initializer)
 */
export function createServerList<T, F extends Record<string, ListFilterValue>>(
  opts: ServerListOptions<T, F>
) {
  const router = inject(Router);
  const route = inject(ActivatedRoute);
  const destroyRef = inject(DestroyRef);
  const syncUrl = opts.syncUrl !== false;
  const sizeOptions = [...(opts.pageSizeOptions ?? DEFAULT_PAGE_SIZE_OPTIONS)];
  const defaultSize = opts.pageSize ?? 10;
  const defaultSortBy = opts.sortBy ?? null;
  const defaultOrder = opts.sortOrder ?? 'DESC';

  const q = syncUrl ? route.snapshot.queryParamMap : null;
  const initialPage = Math.max(1, Number(q?.get('page')) || 1);
  const urlSize = Number(q?.get('limit'));
  const initialSize = sizeOptions.includes(urlSize) ? urlSize : defaultSize;
  const initialSearch = q?.get('q') ?? '';
  const initialSortBy = q?.get('sort') || defaultSortBy;
  const initialOrder: SortOrder =
    q?.get('order') === 'ASC' ? 'ASC' : q?.get('order') === 'DESC' ? 'DESC' : defaultOrder;
  const initialFilters = { ...opts.filters };
  if (q) {
    for (const key of Object.keys(opts.filters) as (keyof F & string)[]) {
      const raw = q.get(key);
      if (raw == null) {
        continue;
      }
      const def = opts.filters[key];
      (initialFilters as Record<string, ListFilterValue>)[key] =
        typeof def === 'number' ? (Number.isFinite(Number(raw)) ? Number(raw) : def) :
        typeof def === 'boolean' ? raw === 'true' :
        raw;
    }
  }

  const pageIndex = signal(initialPage - 1);
  const pageSize = signal(initialSize);
  const search = signal(initialSearch.trim());
  const sortBy = signal<string | null>(initialSortBy);
  const sortOrder = signal<SortOrder>(initialOrder);
  const filters = signal<F>(initialFilters);

  const items = signal<T[]>([]);
  const total = signal(0);
  const loading = signal(false);
  const loaded = signal(false);
  const error = signal<string | null>(null);

  const searchControl = new FormControl(initialSearch, { nonNullable: true });

  const request = computed<ListRequest<F>>(() => ({
    page: pageIndex() + 1,
    limit: pageSize(),
    search: search() || undefined,
    sortBy: sortBy() ?? undefined,
    sortOrder: sortBy() ? sortOrder() : undefined,
    filters: filters(),
  }));

  const keyOf = (req: ListRequest<F>): string => {
    const parts: string[] = [`page=${req.page}`, `limit=${req.limit}`];
    if (req.search) parts.push(`q=${req.search}`);
    if (req.sortBy) parts.push(`sort=${req.sortBy}`, `order=${req.sortOrder}`);
    for (const k of Object.keys(req.filters).sort()) {
      const v = req.filters[k];
      if (v != null && v !== '') parts.push(`${k}=${v}`);
    }
    return `${opts.namespace}?${parts.join('&')}`;
  };

  const load$ = new Subject<{ req: ListRequest<F>; force: boolean }>();

  load$
    .pipe(
      switchMap(({ req, force }) => {
        const key = keyOf(req);
        const hit = force ? undefined : cache.get(key);
        if (hit) {
          items.set(hit.page.items as T[]);
          total.set(hit.page.total);
          loaded.set(true);
        }
        loading.set(true);
        error.set(null);
        return opts.fetch(req).pipe(
          map((page) => ({ req, key, page, err: null as string | null })),
          catchError((err: Error) =>
            of({ req, key, page: null as ListPage<T> | null, err: err?.message || 'โหลดข้อมูลไม่สำเร็จ' })
          )
        );
      }),
      takeUntilDestroyed(destroyRef)
    )
    .subscribe(({ req, key, page, err }) => {
      loading.set(false);
      loaded.set(true);
      if (!page) {
        error.set(err);
        return;
      }
      putCache(key, page as ListPage<unknown>);
      // หน้าเกินจำนวนจริง (เช่น ลบแถวสุดท้ายของหน้า) → ถอยไปหน้าสุดท้าย
      const lastIndex = Math.max(0, Math.ceil(page.total / req.limit) - 1);
      if (req.page - 1 > lastIndex && page.total > 0) {
        pageIndex.set(lastIndex);
        trigger();
        return;
      }
      items.set(page.items);
      total.set(page.total);
      prefetchNext(req, page.total);
    });

  function prefetchNext(req: ListRequest<F>, count: number): void {
    if (req.page * req.limit >= count) {
      return;
    }
    const next = { ...req, page: req.page + 1 };
    const key = keyOf(next);
    if (cache.has(key)) {
      return;
    }
    opts.fetch(next).subscribe({
      next: (page) => putCache(key, page as ListPage<unknown>),
      error: () => undefined,
    });
  }

  function writeUrl(): void {
    if (!syncUrl) {
      return;
    }
    const params: Params = {
      page: pageIndex() > 0 ? pageIndex() + 1 : null,
      limit: pageSize() !== defaultSize ? pageSize() : null,
      q: search() || null,
      sort: sortBy() !== defaultSortBy ? sortBy() : null,
      order: sortBy() !== defaultSortBy || sortOrder() !== defaultOrder ? sortOrder() : null,
    };
    const f = filters();
    for (const k of Object.keys(opts.filters)) {
      const v = f[k];
      params[k] = v === opts.filters[k] || v == null || v === '' ? null : String(v);
    }
    void router.navigate([], {
      relativeTo: route,
      queryParams: params,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  function trigger(force = false): void {
    writeUrl();
    load$.next({ req: request(), force });
  }

  searchControl.valueChanges
    .pipe(
      debounceTime(opts.searchDebounceMs ?? 300),
      map((v) => v.trim()),
      distinctUntilChanged(),
      takeUntilDestroyed(destroyRef)
    )
    .subscribe((term) => {
      if (term === search()) {
        return;
      }
      search.set(term);
      pageIndex.set(0);
      trigger();
    });

  return {
    items: items.asReadonly(),
    total: total.asReadonly(),
    loading: loading.asReadonly(),
    error: error.asReadonly(),
    /** ยังไม่เคยได้ข้อมูล — โชว์ skeleton */
    initialLoading: computed(() => loading() && !loaded()),
    /** มีแถวเดิมอยู่และกำลังโหลดใหม่ — โชว์แถบโหลดบาง ๆ */
    refreshing: computed(() => loading() && loaded()),
    pageIndex: pageIndex.asReadonly(),
    pageSize: pageSize.asReadonly(),
    pageSizeOptions: sizeOptions,
    search: search.asReadonly(),
    searchControl,
    sortBy: sortBy.asReadonly(),
    sortOrder: sortOrder.asReadonly(),
    filters: filters.asReadonly() as Signal<F>,

    /** โหลดครั้งแรก — เรียกใน ngOnInit */
    start(): void {
      trigger();
    },
    /** รีเฟรช · invalidate=true ล้าง cache ของ namespace นี้ก่อน (หลังสร้าง/แก้/ลบ) */
    reload(opts2: { invalidate?: boolean } = {}): void {
      if (opts2.invalidate) {
        invalidateListCache(opts.namespace);
      }
      trigger(!!opts2.invalidate);
    },
    setFilter<K extends keyof F>(key: K, value: F[K]): void {
      if (filters()[key] === value) {
        return;
      }
      filters.update((f) => ({ ...f, [key]: value }));
      pageIndex.set(0);
      trigger();
    },
    patchFilters(patch: Partial<F>): void {
      filters.update((f) => ({ ...f, ...patch }));
      pageIndex.set(0);
      trigger();
    },
    toggleSort(key: string): void {
      if (sortBy() === key) {
        sortOrder.update((o) => (o === 'ASC' ? 'DESC' : 'ASC'));
      } else {
        sortBy.set(key);
        sortOrder.set(opts.sortOrderFor?.(key) ?? 'ASC');
      }
      pageIndex.set(0);
      trigger();
    },
    sortIcon(key: string): string {
      if (sortBy() !== key) {
        return 'unfold_more';
      }
      return sortOrder() === 'ASC' ? 'arrow_upward' : 'arrow_downward';
    },
    onPage(event: PageEvent): void {
      if (event.pageSize !== pageSize()) {
        pageSize.set(event.pageSize);
        pageIndex.set(0);
      } else {
        pageIndex.set(event.pageIndex);
      }
      trigger();
    },
    /** แก้แถวในหน้าปัจจุบัน (เช่น หลัง PATCH) โดยไม่โหลดใหม่ */
    patchItems(fn: (rows: T[]) => T[]): void {
      items.update(fn);
    },
  };
}

export type ServerList<T, F extends Record<string, ListFilterValue>> = ReturnType<
  typeof createServerList<T, F>
>;
