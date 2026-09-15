import { signal } from '@angular/core';

export type SortDir = 'asc' | 'desc';

/**
 * Client-side table header sort state (กดหัวคอลัมน์สลับ asc/desc)
 */
export function createTableSort<K extends string>(
  defaultKey: K,
  defaultDir: SortDir = 'asc'
) {
  const sortKey = signal<K>(defaultKey);
  const sortDir = signal<SortDir>(defaultDir);

  function toggleSort(key: K): void {
    if (sortKey() === key) {
      sortDir.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      sortKey.set(key);
      sortDir.set('asc');
    }
  }

  function sortIcon(key: K): string {
    if (sortKey() !== key) {
      return 'unfold_more';
    }
    return sortDir() === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  function cmp(
    a: string | number | null | undefined,
    b: string | number | null | undefined
  ): number {
    if (a == null && b == null) {
      return 0;
    }
    if (a == null) {
      return 1;
    }
    if (b == null) {
      return -1;
    }
    if (typeof a === 'number' && typeof b === 'number') {
      return a - b;
    }
    return String(a).localeCompare(String(b), 'th', { numeric: true, sensitivity: 'base' });
  }

  function apply<T>(
    list: T[],
    getValue: (row: T, key: K) => string | number | null | undefined
  ): T[] {
    const key = sortKey();
    const dir = sortDir() === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => cmp(getValue(a, key), getValue(b, key)) * dir);
  }

  return {
    sortKey: sortKey.asReadonly(),
    sortDir: sortDir.asReadonly(),
    toggleSort,
    sortIcon,
    apply,
    cmp,
  };
}

export type TableSort<K extends string> = ReturnType<typeof createTableSort<K>>;
