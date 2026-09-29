import { computed, signal } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { CursorPage } from '../../core/http/api.util';

/**
 * รายการเลื่อนโหลดต่อด้วย cursor — หน้าแรกไม่ส่ง cursor (ได้ total) หน้าถัดไปส่ง nextCursor เดิม
 * cursor เป็น opaque: ห้ามแก้/ประกอบเอง · เปลี่ยนตัวกรองหรือรีเฟรชต้อง reset()
 */
export class CursorFeed<T extends { id: number }> {
  private readonly rows = signal<T[]>([]);
  private readonly totalCount = signal<number | null>(null);
  private readonly more = signal(false);
  private readonly firstLoading = signal(false);
  private readonly nextLoading = signal(false);
  private readonly errorText = signal<string | null>(null);

  readonly items = this.rows.asReadonly();
  /** จำจากหน้าแรก — หน้า cursor คืน total: null */
  readonly total = this.totalCount.asReadonly();
  readonly hasMore = this.more.asReadonly();
  readonly loading = this.firstLoading.asReadonly();
  readonly loadingMore = this.nextLoading.asReadonly();
  readonly error = this.errorText.asReadonly();
  readonly busy = computed(() => this.firstLoading() || this.nextLoading());
  /** โหลดครบแล้วและมีอย่างน้อยหนึ่งแถว — ใช้โชว์「แสดงครบแล้ว」 */
  readonly done = computed(
    () => !this.more() && !this.firstLoading() && this.rows().length > 0
  );

  private cursor: string | null = null;
  private sub: Subscription | null = null;
  private generation = 0;

  constructor(
    private readonly fetchPage: (cursor: string | null) => Observable<CursorPage<T>>,
    private readonly onPage?: (items: T[]) => void
  ) {}

  /** เริ่มใหม่จากหน้าแรก — keepRows=true คงแถวเดิมไว้ระหว่างโหลด (รีเฟรชเงียบ) */
  reset(opts: { keepRows?: boolean } = {}): void {
    this.sub?.unsubscribe();
    const gen = ++this.generation;
    this.cursor = null;
    this.more.set(false);
    this.nextLoading.set(false);
    this.errorText.set(null);
    this.firstLoading.set(true);
    if (!opts.keepRows) {
      this.rows.set([]);
      this.totalCount.set(null);
    }
    this.sub = this.fetchPage(null).subscribe({
      next: (page) => {
        if (gen !== this.generation) {
          return;
        }
        this.rows.set(page.items);
        this.totalCount.set(page.total ?? page.items.length);
        this.applyCursor(page);
        this.firstLoading.set(false);
        this.onPage?.(page.items);
      },
      error: (err: Error) => {
        if (gen !== this.generation) {
          return;
        }
        this.rows.set([]);
        this.totalCount.set(null);
        this.errorText.set(err.message || 'โหลดข้อมูลไม่สำเร็จ');
        this.firstLoading.set(false);
      },
    });
  }

  loadMore(): void {
    if (this.firstLoading() || this.nextLoading() || !this.more() || !this.cursor) {
      return;
    }
    const gen = this.generation;
    this.nextLoading.set(true);
    this.errorText.set(null);
    this.sub = this.fetchPage(this.cursor).subscribe({
      next: (page) => {
        if (gen !== this.generation) {
          return;
        }
        const seen = new Set(this.rows().map((r) => r.id));
        const fresh = page.items.filter((r) => !seen.has(r.id));
        this.rows.update((list) => [...list, ...fresh]);
        this.applyCursor(page);
        this.nextLoading.set(false);
        this.onPage?.(fresh);
      },
      error: (err: Error) => {
        if (gen !== this.generation) {
          return;
        }
        this.errorText.set(err.message || 'โหลดเพิ่มไม่สำเร็จ');
        this.nextLoading.set(false);
      },
    });
  }

  /** แก้แถวในที่ (optimistic update) */
  update(fn: (rows: T[]) => T[]): void {
    this.rows.update(fn);
  }

  adjustTotal(delta: number): void {
    this.totalCount.update((t) => (t == null ? t : Math.max(0, t + delta)));
  }

  destroy(): void {
    this.generation++;
    this.sub?.unsubscribe();
    this.sub = null;
  }

  private applyCursor(page: CursorPage<T>): void {
    this.cursor = page.nextCursor;
    this.more.set(page.hasMore && !!page.nextCursor);
  }
}
