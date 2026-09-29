import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** แถบโหลดบาง ๆ บนตาราง — ใช้ตอนรีเฟรชโดยคงแถวเดิมไว้ */
@Component({
  selector: 'app-list-loading-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="bar" [class.is-active]="active()" role="progressbar" [attr.aria-hidden]="!active()"></div>`,
  styles: `
    :host {
      display: block;
      position: relative;
      height: 3px;
      overflow: hidden;
    }
    .bar {
      position: absolute;
      inset: 0;
      opacity: 0;
      transition: opacity 0.15s ease;
    }
    .bar.is-active {
      opacity: 1;
      background: linear-gradient(90deg, transparent 0%, #0f766e 40%, #14b8a6 60%, transparent 100%);
      background-size: 200% 100%;
      animation: list-bar 1.1s linear infinite;
    }
    @keyframes list-bar {
      from { background-position: 200% 0; }
      to { background-position: -200% 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      .bar.is-active { animation: none; background: #0f766e; }
    }
  `,
})
export class ListLoadingBarComponent {
  readonly active = input(false);
}

/** โครงแถวตอนโหลดครั้งแรก */
@Component({
  selector: 'app-list-skeleton',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="skeleton" aria-busy="true" aria-label="กำลังโหลด">
      @for (r of rowList(); track r) {
        <div class="row">
          @for (c of colList(); track c) {
            <span class="cell" [style.flex]="c === 0 ? '0 0 18%' : '1 1 0'"></span>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .skeleton {
      padding: 0.35rem 1rem 0.75rem;
    }
    .row {
      display: flex;
      gap: 1rem;
      align-items: center;
      height: 48px;
      border-bottom: 1px solid #eef2f1;
    }
    .cell {
      height: 12px;
      border-radius: 6px;
      background: linear-gradient(90deg, #eef2f1 25%, #f7faf9 50%, #eef2f1 75%);
      background-size: 200% 100%;
      animation: list-shimmer 1.2s ease-in-out infinite;
    }
    @keyframes list-shimmer {
      from { background-position: 200% 0; }
      to { background-position: -200% 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      .cell { animation: none; }
    }
  `,
})
export class ListSkeletonComponent {
  readonly rows = input(6);
  readonly cols = input(5);
  readonly rowList = computed(() => Array.from({ length: this.rows() }, (_, i) => i));
  readonly colList = computed(() => Array.from({ length: this.cols() }, (_, i) => i));
}
