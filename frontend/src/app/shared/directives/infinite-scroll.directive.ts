import {
  Directive,
  ElementRef,
  NgZone,
  OnDestroy,
  afterNextRender,
  effect,
  inject,
  input,
  output,
} from '@angular/core';

/**
 * วางบน sentinel ท้ายรายการ — เห็น sentinel แล้ว emit `reached`
 * `resetKey` เปลี่ยน (เช่น จำนวนแถว) → observe ใหม่ เผื่อ sentinel ยังอยู่ในจอหลังโหลดเพิ่ม
 */
@Directive({
  selector: '[appInfiniteScroll]',
  standalone: true,
})
export class InfiniteScrollDirective implements OnDestroy {
  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);

  readonly disabled = input(false, { alias: 'appInfiniteScrollDisabled' });
  readonly resetKey = input<unknown>(null, { alias: 'appInfiniteScrollKey' });
  readonly rootMargin = input('240px', { alias: 'appInfiniteScrollMargin' });
  readonly reached = output<void>();

  private observer: IntersectionObserver | null = null;

  constructor() {
    afterNextRender(() => {
      this.observer = new IntersectionObserver(
        (entries) => {
          if (this.disabled() || !entries.some((e) => e.isIntersecting)) {
            return;
          }
          this.zone.run(() => this.reached.emit());
        },
        { rootMargin: this.rootMargin() }
      );
      this.observe();
    });
    effect(() => {
      this.resetKey();
      this.disabled();
      this.observe();
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  private observe(): void {
    if (!this.observer) {
      return;
    }
    this.observer.unobserve(this.el.nativeElement);
    if (!this.disabled()) {
      this.observer.observe(this.el.nativeElement);
    }
  }
}
