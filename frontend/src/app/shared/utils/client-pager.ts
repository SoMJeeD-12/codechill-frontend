import { Injector, Signal, computed, effect, inject, runInInjectionContext, signal } from '@angular/core';
import { PageEvent } from '@angular/material/paginator';

export const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

/**
 * Client-side table pager for signal-backed lists.
 * Call from a component field initializer / constructor (injection context).
 */
export function createClientPager<T>(
  source: Signal<T[]>,
  initialPageSize = 10,
  pageSizeOptions: readonly number[] = DEFAULT_PAGE_SIZE_OPTIONS
) {
  const injector = inject(Injector);
  const pageIndex = signal(0);
  const pageSize = signal(initialPageSize);

  runInInjectionContext(injector, () => {
    effect(() => {
      const total = source().length;
      const size = pageSize();
      const maxPage = Math.max(0, Math.ceil(total / size) - 1);
      if (pageIndex() > maxPage) {
        pageIndex.set(maxPage);
      }
    });
  });

  const length = computed(() => source().length);

  const paged = computed(() => {
    const list = source();
    const size = pageSize();
    const start = pageIndex() * size;
    return list.slice(start, start + size);
  });

  function onPage(event: PageEvent): void {
    pageIndex.set(event.pageIndex);
    pageSize.set(event.pageSize);
  }

  function reset(): void {
    pageIndex.set(0);
  }

  return {
    pageIndex: pageIndex.asReadonly(),
    pageSize: pageSize.asReadonly(),
    pageSizeOptions: [...pageSizeOptions],
    length,
    paged,
    onPage,
    reset,
  };
}

export type ClientPager<T> = ReturnType<typeof createClientPager<T>>;
