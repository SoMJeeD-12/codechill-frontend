import {
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subscription } from 'rxjs';
import {
  DashboardGroupBy,
  DashboardPeriod,
  MyDashboard,
  MyDashboardMetric,
  MyDashboardQuery,
  MyDashboardService,
} from '../../core/services/my-dashboard.service';
import {
  addDays,
  addMonthsClamped,
  formatThaiDateRange,
  formatThaiPeriodLabel,
  parseDateOnly,
  toDateOnlyString,
} from '../../core/utils/date.util';
import { ChartTooltipData, ChartTooltipDirective } from '../../shared/chart-tooltip/chart-tooltip';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { createClientPager } from '../../shared/utils/client-pager';

interface MetricDef {
  key: MyDashboardMetric;
  label: string;
  icon: string;
  /** สีประจำเรื่อง — ใช้ชุดเดียวทุกกล่อง · ห้ามเขียว/แดง (สื่อดี/แย่) */
  color: string;
  hint?: string;
}

type ActivityMode = 'bar' | 'line';

interface PeriodColumn {
  key: string;
  label: string;
  showLabel: boolean;
  values: { metric: MetricDef; value: number }[];
  sum: number;
  segments: { metric: MetricDef; value: number; heightPct: number }[];
  tip: ChartTooltipData;
}

interface LineSeries {
  metric: MetricDef;
  line: string;
  area: string;
  dots: { leftPct: number; bottomPct: number }[];
}

interface DonutSlice {
  metric: MetricDef;
  value: number;
  pct: number;
  dashArray: string;
  dashOffset: number;
}

interface MiniChart {
  metric: MetricDef;
  total: number;
  bars: { key: string; heightPct: number; tip: ChartTooltipData }[];
  firstLabel: string;
  lastLabel: string;
}

const METRICS: MetricDef[] = [
  {
    key: 'projectsDelivered',
    label: 'โปรเจคที่ส่งมอบ',
    icon: 'inventory',
    color: '#4f6bd8',
    hint: 'โปรเจคที่คุณเป็นผู้จัดการและส่งมอบในช่วงนี้',
  },
  { key: 'tasksCompleted', label: 'งานที่ทำเสร็จ', icon: 'task_alt', color: '#0e8fb3' },
  {
    key: 'ticketRoundsResolved',
    label: 'รอบการแก้ปัญหา',
    icon: 'build_circle',
    color: '#8b5cf6',
    hint: 'นับทุกรอบที่แก้ — ใบเดียวแก้หลายรอบนับทุกรอบ',
  },
  { key: 'followUpsCompleted', label: 'งานติดตามที่ปิด', icon: 'event_available', color: '#d99a1e' },
  { key: 'communicationsLogged', label: 'การติดต่อลูกค้า', icon: 'forum', color: '#8a7565' },
];

const PERIODS: { value: DashboardPeriod; label: string }[] = [
  { value: 'WEEK', label: 'สัปดาห์นี้' },
  { value: 'MONTH', label: 'เดือนนี้' },
  { value: 'QUARTER', label: 'ไตรมาสนี้' },
  { value: 'YEAR', label: 'ปีนี้' },
  { value: 'CUSTOM', label: 'กำหนดเอง' },
];

const GROUP_BYS: { value: DashboardGroupBy | null; label: string }[] = [
  { value: null, label: 'อัตโนมัติ' },
  { value: 'DAY', label: 'รายวัน' },
  { value: 'WEEK', label: 'รายสัปดาห์' },
  { value: 'MONTH', label: 'รายเดือน' },
];

const GROUP_BY_LABELS: Record<DashboardGroupBy, string> = {
  DAY: 'รายวัน',
  WEEK: 'รายสัปดาห์',
  MONTH: 'รายเดือน',
};

const MODE_STORAGE_KEY = 'cpams.myDashboard.activityMode';

/** พื้นที่ต่อป้ายแกน X — จำนวนป้ายคำนวณจากความกว้างจริงของกราฟ */
const AXIS_LABEL_PX = 64;
/** คอลัมน์แคบกว่านี้ ไม่แสดงตัวเลขบนยอดแท่ง */
const SUM_LABEL_MIN_PX = 24;
/** แบ่งรายวันได้ไม่เกิน (BE ตอบ 400) */
const MAX_DAY_BUCKETS = 366;
/** กำหนดเองได้ยาวสุด (BE ตอบ 400) */
const MAX_RANGE_MONTHS = 120;

const DONUT_RADIUS = 70;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

function readStoredMode(): ActivityMode {
  try {
    return localStorage.getItem(MODE_STORAGE_KEY) === 'line' ? 'line' : 'bar';
  } catch {
    return 'bar';
  }
}

/**
 * แดชบอร์ดของฉัน — GET /dashboard/me
 * ของใครของมัน ไม่มีตัวเลือกดูคนอื่น · ไม่ใช่เครื่องมือประเมิน
 * (ไม่มีอันดับ/เป้า/ค่าเฉลี่ยทีม/เทียบช่วงก่อน/สีดี-แย่)
 */
@Component({
  selector: 'app-my-dashboard-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    ChartTooltipDirective,
    TablePaginatorComponent,
  ],
  templateUrl: './my-dashboard-page.component.html',
  styleUrl: './my-dashboard-page.component.scss',
})
export class MyDashboardPageComponent implements OnInit, OnDestroy {
  private readonly api = inject(MyDashboardService);

  readonly periods = PERIODS;
  readonly groupBys = GROUP_BYS;
  readonly groupByLabels = GROUP_BY_LABELS;
  readonly donutRadius = DONUT_RADIUS;

  readonly period = signal<DashboardPeriod>('MONTH');
  readonly groupBy = signal<DashboardGroupBy | null>(null);
  readonly range = new FormGroup({
    start: new FormControl<Date | null>(null),
    end: new FormControl<Date | null>(null),
  });

  readonly data = signal<MyDashboard | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly activityMode = signal<ActivityMode>(readStoredMode());
  readonly tableOpen = signal(false);
  /** เรื่องที่เน้นทั้งหน้า — คงไว้ข้ามการเปลี่ยนช่วงเวลา */
  private readonly focusKey = signal<MyDashboardMetric | null>(null);
  /** เรื่องที่ซ่อนจาก legend ของกล่องกิจกรรม */
  private readonly hiddenMetrics = signal<ReadonlySet<MyDashboardMetric>>(new Set());

  /** เรื่องที่ไม่เป็น null — null = ไม่มีสิทธิ์ ห้ามโผล่ทุกกล่อง */
  readonly visibleMetrics = computed(() => {
    const totals = this.data()?.totals;
    return totals ? METRICS.filter((m) => totals[m.key] != null) : [];
  });

  readonly noAccess = computed(() => {
    const d = this.data();
    return !!d && this.visibleMetrics().length === 0 && d.projectsInProgress == null;
  });

  readonly focus = computed<MetricDef | null>(
    () => this.visibleMetrics().find((m) => m.key === this.focusKey()) ?? null
  );

  /** เรื่องที่วาดในกล่องกิจกรรม — เน้นอยู่ = เรื่องเดียว, ไม่เน้น = ตัดที่ซ่อนใน legend */
  readonly activityMetrics = computed(() => {
    const focus = this.focus();
    if (focus) {
      return [focus];
    }
    const hidden = this.hiddenMetrics();
    return this.visibleMetrics().filter((m) => !hidden.has(m.key));
  });

  private readonly withYear = computed(() => {
    const d = this.data();
    return !!d && d.dateFrom.slice(0, 4) !== d.dateTo.slice(0, 4);
  });

  private readonly periodLabels = computed(() => {
    const d = this.data();
    if (!d) {
      return [] as string[];
    }
    return d.series.map((p) => formatThaiPeriodLabel(p.periodStart, p.periodEnd, this.withYear()));
  });

  /** ความกว้างจริงของกล่องกราฟกิจกรรม (ResizeObserver) */
  private readonly chartWidth = signal(0);
  private readonly activityChart = viewChild<ElementRef<HTMLElement>>('activityChart');

  /** คอลัมน์แคบจนตัวเลขบนยอดแท่งทับกัน */
  readonly denseColumns = computed(() => {
    const n = this.data()?.series.length ?? 0;
    return n > 0 && this.chartWidth() / n < SUM_LABEL_MIN_PX;
  });

  readonly periodColumns = computed<PeriodColumn[]>(() => {
    const d = this.data();
    if (!d) {
      return [];
    }
    const metrics = this.activityMetrics();
    const labels = this.periodLabels();
    const fit = Math.max(2, Math.floor(this.chartWidth() / AXIS_LABEL_PX));
    const every = Math.max(1, Math.ceil(d.series.length / fit));
    const rows = d.series.map((p) => {
      const values = metrics.map((metric) => ({ metric, value: p[metric.key] ?? 0 }));
      return { values, sum: values.reduce((s, v) => s + v.value, 0) };
    });
    const maxSum = Math.max(...rows.map((r) => r.sum), 0);
    return rows.map((r, i) => ({
      key: d.series[i].periodStart,
      label: labels[i],
      showLabel: i % every === 0,
      values: r.values,
      sum: r.sum,
      segments: r.values
        .filter((v) => v.value > 0)
        .map((v) => ({ ...v, heightPct: maxSum > 0 ? (v.value / maxSum) * 100 : 0 })),
      tip: {
        title: labels[i],
        rows: r.values.map((v) => ({ label: v.metric.label, value: v.value, color: v.metric.color })),
        total: r.values.length > 1 ? r.sum : null,
      },
    }));
  });

  readonly activityMax = computed(() => Math.max(...this.periodColumns().map((c) => c.sum), 0));

  /** เส้น/area — x = กลางคอลัมน์, สเกลร่วมทุกเส้น (viewBox 1000 × 100) */
  readonly lineSeries = computed<LineSeries[]>(() => {
    const columns = this.periodColumns();
    const n = columns.length;
    if (!n) {
      return [];
    }
    const max = Math.max(...columns.flatMap((c) => c.values.map((v) => v.value)), 0);
    return this.activityMetrics().map((metric, mi) => {
      const dots = columns.map((c, i) => ({
        leftPct: ((i + 0.5) / n) * 100,
        bottomPct: max > 0 ? ((c.values[mi]?.value ?? 0) / max) * 100 : 0,
      }));
      const pts = dots.map((p) => `${p.leftPct * 10},${100 - p.bottomPct}`);
      const first = dots[0].leftPct * 10;
      const last = dots[n - 1].leftPct * 10;
      return {
        metric,
        dots,
        line: pts.join(' '),
        area: `${first},100 ${pts.join(' ')} ${last},100`,
      };
    });
  });

  readonly lineMax = computed(() =>
    Math.max(...this.periodColumns().flatMap((c) => c.values.map((v) => v.value)), 0)
  );

  /** โดนัทจาก totals — เฉพาะเรื่องที่ไม่เป็น null และ > 0 · ไม่รวม projectsInProgress */
  readonly donut = computed(() => {
    const totals = this.data()?.totals;
    if (!totals) {
      return { total: 0, slices: [] as DonutSlice[] };
    }
    const items = this.visibleMetrics()
      .map((metric) => ({ metric, value: totals[metric.key] ?? 0 }))
      .filter((i) => i.value > 0);
    const total = items.reduce((s, i) => s + i.value, 0);
    let offset = 0;
    const slices = items.map((i) => {
      const length = total > 0 ? (i.value / total) * DONUT_CIRCUMFERENCE : 0;
      const slice: DonutSlice = {
        ...i,
        pct: total > 0 ? (i.value / total) * 100 : 0,
        dashArray: `${length} ${DONUT_CIRCUMFERENCE - length}`,
        dashOffset: -offset,
      };
      offset += length;
      return slice;
    });
    return { total, slices };
  });

  /** กล่องแยกรายเรื่อง — สเกลของแต่ละกล่องเอง */
  readonly miniCharts = computed<MiniChart[]>(() => {
    const d = this.data();
    if (!d) {
      return [];
    }
    const labels = this.periodLabels();
    return this.visibleMetrics().map((metric) => {
      const values = d.series.map((p) => p[metric.key] ?? 0);
      const max = Math.max(...values, 0);
      return {
        metric,
        total: d.totals[metric.key] ?? 0,
        bars: values.map((value, i) => ({
          key: d.series[i].periodStart,
          heightPct: max > 0 ? (value / max) * 100 : 0,
          tip: { title: labels[i], rows: [{ label: metric.label, value, color: metric.color }] },
        })),
        firstLabel: labels[0] ?? '',
        lastLabel: labels.length > 1 ? labels[labels.length - 1] : '',
      };
    });
  });

  /** ตาราง — ช่วงล่าสุดขึ้นก่อน (กราฟเรียงเก่า → ใหม่) · แบ่งหน้าที่ FE */
  readonly tableRows = computed(() => {
    const d = this.data();
    if (!d) {
      return [];
    }
    const labels = this.periodLabels();
    return d.series.map((p, i) => ({ key: p.periodStart, label: labels[i], point: p })).reverse();
  });

  readonly tablePager = createClientPager(this.tableRows, 10);

  /** จำนวนวันของช่วงกำหนดเอง (นับวันสุดท้ายรวม) */
  private readonly customDays = signal(0);
  readonly customRangeTooLong = signal(false);
  /** กำหนดเองยาวเกิน 366 วัน — ปิดปุ่มรายวันไว้ก่อน ไม่ยิงไปให้ได้ 400 */
  readonly dayDisabled = computed(
    () => this.period() === 'CUSTOM' && this.customDays() > MAX_DAY_BUCKETS
  );

  private sub?: Subscription;
  private resizeObserver?: ResizeObserver;

  constructor() {
    this.range.valueChanges.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(() => {
      this.syncCustomRange();
    });
    effect((onCleanup) => {
      const el = this.activityChart()?.nativeElement;
      if (!el || typeof ResizeObserver === 'undefined') {
        return;
      }
      const observer = new ResizeObserver((entries) => {
        this.chartWidth.set(entries[0]?.contentRect.width ?? 0);
      });
      observer.observe(el);
      this.resizeObserver = observer;
      onCleanup(() => observer.disconnect());
    });
  }

  ngOnInit(): void {
    this.reload();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.resizeObserver?.disconnect();
  }

  toggleFocus(key: MyDashboardMetric): void {
    this.focusKey.update((prev) => (prev === key ? null : key));
  }

  clearFocus(): void {
    this.focusKey.set(null);
  }

  isFocused(key: MyDashboardMetric): boolean {
    return this.focus()?.key === key;
  }

  isDimmed(key: MyDashboardMetric): boolean {
    const focus = this.focus();
    return !!focus && focus.key !== key;
  }

  isHidden(key: MyDashboardMetric): boolean {
    return this.hiddenMetrics().has(key);
  }

  toggleMetric(key: MyDashboardMetric): void {
    this.hiddenMetrics.update((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  setActivityMode(mode: ActivityMode): void {
    this.activityMode.set(mode);
    try {
      localStorage.setItem(MODE_STORAGE_KEY, mode);
    } catch {
      // storage ถูกปิด — ใช้ค่าในหน่วยความจำต่อ
    }
  }

  setPeriod(value: DashboardPeriod): void {
    if (this.period() === value) {
      return;
    }
    this.period.set(value);
    const d = this.data();
    if (value === 'CUSTOM' && d && !this.range.value.start && !this.range.value.end) {
      this.range.setValue({ start: parseDateOnly(d.dateFrom), end: parseDateOnly(d.dateTo) });
    }
    this.reload();
  }

  setGroupBy(value: DashboardGroupBy | null): void {
    if (this.groupBy() === value) {
      return;
    }
    this.groupBy.set(value);
    this.reload();
  }

  onRangeClosed(): void {
    if (this.period() === 'CUSTOM') {
      this.reload();
    }
  }

  customRangeIncomplete(): boolean {
    const { start, end } = this.range.value;
    return this.period() === 'CUSTOM' && (!start || !end);
  }

  private syncCustomRange(): void {
    const { start, end } = this.range.value;
    if (!start || !end || end < start) {
      this.customDays.set(0);
      this.customRangeTooLong.set(false);
      return;
    }
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    this.customDays.set(days);
    this.customRangeTooLong.set(end > addDays(addMonthsClamped(start, MAX_RANGE_MONTHS), -1));
    if (this.dayDisabled() && this.groupBy() === 'DAY') {
      this.groupBy.set(null);
    }
  }

  reload(): void {
    const query = this.buildQuery();
    if (!query) {
      return;
    }
    this.sub?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.sub = this.api.get(query).subscribe({
      next: (res) => {
        this.data.set(res);
        this.tablePager.reset();
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.error.set(err.message || 'โหลดแดชบอร์ดไม่สำเร็จ');
        this.loading.set(false);
      },
    });
  }

  /** อ่านจาก response — ตรงกับ BE เสมอ */
  rangeLabel(d: MyDashboard): string {
    return `${formatThaiDateRange(d.dateFrom, d.dateTo)} · แบ่ง${GROUP_BY_LABELS[d.groupBy]}`;
  }

  private buildQuery(): MyDashboardQuery | null {
    const groupBy = this.groupBy() ?? undefined;
    const period = this.period();
    if (period !== 'CUSTOM') {
      return { period, groupBy };
    }
    const { start, end } = this.range.value;
    if (!start || !end || this.customRangeTooLong()) {
      return null;
    }
    return { dateFrom: toDateOnlyString(start), dateTo: toDateOnlyString(end), groupBy };
  }
}
