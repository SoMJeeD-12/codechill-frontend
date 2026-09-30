import {
  ConnectedPosition,
  Overlay,
  OverlayRef,
} from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import {
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  Directive,
  ElementRef,
  Injectable,
  OnDestroy,
  inject,
  input,
} from '@angular/core';

export interface ChartTooltipRow {
  label: string;
  value: number | string;
  color?: string;
}

/** ข้อมูลจุดที่ชี้ — วันที่/ช่วง + ค่าทุกเรื่อง + รวม (ถ้ามี) */
export interface ChartTooltipData {
  title: string;
  rows: ChartTooltipRow[];
  total?: number | null;
}

/** ลำดับสำรอง: ขวา → ซ้าย → บน → ล่าง แล้ว withPush ดันกลับเข้าจอ */
const POSITIONS: ConnectedPosition[] = [
  { originX: 'end', originY: 'center', overlayX: 'start', overlayY: 'center', offsetX: 8 },
  { originX: 'start', originY: 'center', overlayX: 'end', overlayY: 'center', offsetX: -8 },
  { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -8 },
  { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 8 },
];

@Component({
  selector: 'app-chart-tooltip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (data(); as d) {
      <div class="tip" role="tooltip">
        <div class="tip__title">{{ d.title }}</div>
        @for (row of d.rows; track row.label) {
          <div class="tip__row">
            @if (row.color) {
              <span class="tip__swatch" [style.background]="row.color"></span>
            }
            <span class="tip__label">{{ row.label }}</span>
            <b>{{ row.value }}</b>
          </div>
        }
        @if (d.total != null) {
          <div class="tip__row tip__row--sum">
            <span class="tip__label">รวม</span>
            <b>{{ d.total }}</b>
          </div>
        }
      </div>
    }
  `,
  styles: `
    .tip {
      min-width: 170px;
      max-width: min(320px, calc(100vw - 16px));
      padding: 0.5rem 0.65rem;
      border-radius: 10px;
      background: #1f2d2a;
      color: #fff;
      font-size: 0.78rem;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    }
    .tip__title {
      margin-bottom: 0.25rem;
      font-weight: 700;
    }
    .tip__row {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      line-height: 1.6;
    }
    .tip__swatch {
      flex: 0 0 auto;
      width: 10px;
      height: 10px;
      border-radius: 3px;
    }
    .tip__label {
      flex: 1;
    }
    .tip__row--sum {
      margin-top: 0.2rem;
      padding-top: 0.2rem;
      border-top: 1px solid rgba(255, 255, 255, 0.2);
    }
  `,
})
export class ChartTooltipComponent {
  readonly data = input<ChartTooltipData | null>(null);
}

/**
 * tooltip กลางของกราฟทุกตัว — render ใน CDK overlay ระดับหน้า (ไม่อยู่ใน DOM ของกล่องกราฟ)
 * วางตำแหน่งจากขอบ viewport จริงทุกครั้งที่แสดง
 */
@Injectable({ providedIn: 'root' })
export class ChartTooltipService {
  private readonly overlay = inject(Overlay);
  private overlayRef: OverlayRef | null = null;
  private componentRef: ComponentRef<ChartTooltipComponent> | null = null;
  private owner: HTMLElement | null = null;

  show(origin: HTMLElement, data: ChartTooltipData): void {
    const positionStrategy = this.overlay
      .position()
      .flexibleConnectedTo(origin)
      .withPositions(POSITIONS)
      .withPush(true)
      .withViewportMargin(8)
      .withFlexibleDimensions(false);

    if (!this.overlayRef) {
      this.overlayRef = this.overlay.create({
        positionStrategy,
        scrollStrategy: this.overlay.scrollStrategies.reposition(),
        panelClass: 'chart-tooltip-panel',
      });
    } else {
      this.overlayRef.updatePositionStrategy(positionStrategy);
    }
    if (!this.overlayRef.hasAttached()) {
      this.componentRef = this.overlayRef.attach(new ComponentPortal(ChartTooltipComponent));
    }
    this.owner = origin;
    this.componentRef?.setInput('data', data);
    this.componentRef?.changeDetectorRef.detectChanges();
    this.overlayRef.updatePosition();
  }

  /** ซ่อนเฉพาะเมื่อผู้เรียกเป็นเจ้าของ tooltip ปัจจุบัน */
  hide(origin?: HTMLElement): void {
    if (origin && origin !== this.owner) {
      return;
    }
    this.owner = null;
    this.overlayRef?.detach();
    this.componentRef = null;
  }
}

@Directive({
  selector: '[appChartTooltip]',
  standalone: true,
  host: {
    '(mouseenter)': 'show()',
    '(focus)': 'show()',
    '(mouseleave)': 'hide()',
    '(blur)': 'hide()',
  },
})
export class ChartTooltipDirective implements OnDestroy {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly tooltip = inject(ChartTooltipService);

  /** null = จุดนี้ไม่รับ hover (เช่น ช่วงที่ไม่มีข้อมูล) */
  readonly appChartTooltip = input.required<ChartTooltipData | null>();

  show(): void {
    const data = this.appChartTooltip();
    if (data) {
      this.tooltip.show(this.el.nativeElement, data);
    }
  }

  hide(): void {
    this.tooltip.hide(this.el.nativeElement);
  }

  ngOnDestroy(): void {
    this.hide();
  }
}
