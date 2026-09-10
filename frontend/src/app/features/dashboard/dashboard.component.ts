import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize, map, switchMap } from 'rxjs/operators';
import { MENU_ITEMS } from '../../core/nav/menu-items';
import { MenuItem } from '../../core/models/permission.model';
import { OPEN_PROJECT_STATUSES, Project, TaskItem } from '../../core/models/project.model';
import {
  BILLING_TYPE_LABELS,
  BillingType,
  OPEN_TICKET_STATUSES,
  Ticket,
} from '../../core/models/ticket.model';
import { WARRANTY_NEAR_EXPIRY_DAYS, Warranty } from '../../core/models/warranty.model';
import { MaContract } from '../../core/models/ma.model';
import { FollowUp } from '../../core/models/follow-up.model';
import { Customer } from '../../core/models/customer.model';
import { AuthService } from '../../core/services/auth.service';
import { CustomerService } from '../../core/services/customer.service';
import { FollowUpService } from '../../core/services/follow-up.service';
import { MaService } from '../../core/services/ma.service';
import { ProjectService } from '../../core/services/project.service';
import { Survey } from '../../core/models/survey.model';
import { SurveyService } from '../../core/services/survey.service';
import { TicketService } from '../../core/services/ticket.service';
import { WarrantyService } from '../../core/services/warranty.service';
import { formatMoneyDisplay } from '../../core/utils/money.util';
import { parseDateOnly } from '../../core/utils/date.util';

export interface DashboardStat {
  label: string;
  value: string;
  icon: string;
  hint: string;
  route: string;
  tone: 'neutral' | 'warn' | 'urgent';
}

export interface ChartBar {
  label: string;
  value: number;
  percent: number;
  secondary?: number;
  secondaryPercent?: number;
}

export interface ChartSlice {
  label: string;
  value: number;
  color: string;
}

export interface RiskAlert {
  text: string;
  tone: 'urgent' | 'warn' | 'ok';
  route: string;
}

const BILLING_COLORS: Record<BillingType, string> = {
  WARRANTY: '#0f766e',
  MA_QUOTA: '#0369a1',
  ADDON: '#7c3aed',
  ONE_TIME: '#b45309',
  FREE: '#64748b',
};

const MOCK_OPENED = [8, 11, 9, 14];
const MOCK_CLOSED = [6, 10, 12, 11];
const WEEK_LABELS = ['สัปดาห์ 1', 'สัปดาห์ 2', 'สัปดาห์ 3', 'สัปดาห์ 4'];

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly customers = inject(CustomerService);
  private readonly projects = inject(ProjectService);
  private readonly tickets = inject(TicketService);
  private readonly followUps = inject(FollowUpService);
  private readonly warranties = inject(WarrantyService);
  private readonly ma = inject(MaService);
  private readonly surveys = inject(SurveyService);

  readonly user = this.auth.currentUser;
  readonly isExecutive = this.auth.isAdminLevel;
  readonly loading = signal(true);

  readonly stats = signal<DashboardStat[]>([]);
  readonly risks = signal<RiskAlert[]>([]);
  readonly openCloseTrend = signal<ChartBar[]>(buildOpenCloseTrend());
  readonly billingSlices = signal<ChartSlice[]>([]);
  readonly maMonthBars = signal<ChartBar[]>([]);
  readonly csatBars = signal<ChartBar[]>([]);
  readonly csatAvg = signal<string>('—');
  readonly maAnnualLabel = signal('฿0');

  readonly billingGradient = computed(() => conicGradient(this.billingSlices()));
  readonly billingTotal = computed(() =>
    this.billingSlices().reduce((sum, s) => sum + s.value, 0)
  );

  readonly quickLinks = computed(() => {
    const codes = new Set(this.auth.getVisibleMenuCodes());
    return MENU_ITEMS.filter(
      (m: MenuItem) => codes.has(m.code) && m.code !== 'dashboard'
    ).slice(0, 6);
  });

  ngOnInit(): void {
    this.reload();
  }

  slicePercent(value: number): number {
    const total = this.billingTotal();
    return total > 0 ? Math.round((value / total) * 100) : 0;
  }

  reload(): void {
    this.loading.set(true);

    forkJoin({
      customers: this.customers.listCustomers({ limit: 100 }).pipe(catchError(() => of([]))),
      projects: this.projects.listProjects({ limit: 100 }).pipe(catchError(() => of([]))),
      allTickets: this.tickets.list({ limit: 100 }).pipe(catchError(() => of([] as Ticket[]))),
      pendingTickets: this.tickets
        .listPending({ limit: 50 })
        .pipe(catchError(() => of([] as Ticket[]))),
      warranties: this.warranties
        .listExpiring({ days: WARRANTY_NEAR_EXPIRY_DAYS, limit: 50 })
        .pipe(catchError(() => of([] as Warranty[]))),
      maExpiring: this.ma
        .list({ expiringInDays: 60, limit: 100 })
        .pipe(catchError(() => of([] as MaContract[]))),
      maAll: this.ma.list({ limit: 100 }).pipe(catchError(() => of([] as MaContract[]))),
      overdueTasks: this.projects.listOverdueTasks({ limit: 100 }).pipe(catchError(() => of([]))),
      dueSoonTasks: this.projects
        .listDueSoonTasks({ withinDays: 7, limit: 100 })
        .pipe(catchError(() => of([]))),
    })
      .pipe(
        switchMap((data) => {
          const follow$ = this.followUps
            .list({ limit: 100 })
            .pipe(catchError(() => of([] as FollowUp[])));
          const survey$ = this.surveys.list().pipe(catchError(() => of([] as Survey[])));
          return forkJoin({ followUpList: follow$, surveys: survey$ }).pipe(
            map(({ followUpList, surveys }) => ({ ...data, followUpList, surveys }))
          );
        }),
        finalize(() => this.loading.set(false))
      )
      .subscribe((data) => this.applyDashboard(data));
  }

  private applyDashboard(data: {
    customers: Customer[];
    projects: Project[];
    allTickets: Ticket[];
    pendingTickets: Ticket[];
    warranties: Warranty[];
    maExpiring: MaContract[];
    maAll: MaContract[];
    followUpList: FollowUp[];
    surveys: Survey[];
    overdueTasks: TaskItem[];
    dueSoonTasks: TaskItem[];
  }): void {
    const openProjects = data.projects.filter((p) =>
      OPEN_PROJECT_STATUSES.includes(p.status)
    ).length;
    const overdueFollowUps = data.followUpList.filter((f) => this.followUps.isOverdue(f));
    const overdueTaskCount = data.overdueTasks.length;
    const dueSoonCount = data.dueSoonTasks.length;
    const activeMa = data.maAll.filter((c) => c.isCurrentlyActive);
    const lowQuota = activeMa.filter((c) => this.ma.remainingQuota(c) <= 2);
    const maExpiring30 = data.maExpiring.filter((c) => c.daysUntilExpiry <= 30);
    const reopened = data.allTickets.filter((t) => t.status === 'REOPENED').length;
    const openCount =
      data.pendingTickets.length ||
      data.allTickets.filter((t) => OPEN_TICKET_STATUSES.includes(t.status)).length;
    const reopenRate =
      data.allTickets.length > 0
        ? Math.round((reopened / data.allTickets.length) * 100)
        : 0;

    const maAnnual = activeMa.reduce((s, c) => s + (Number(c.price) || 0), 0);
    this.maAnnualLabel.set(thb(maAnnual));

    const totalResponses = data.surveys.reduce((sum, s) => sum + (s.responseCount || 0), 0);
    this.csatAvg.set(totalResponses > 0 ? String(totalResponses) : '—');

    const taskOverdueStat: DashboardStat = {
      label: 'งานเกินกำหนด',
      value: String(overdueTaskCount),
      icon: 'assignment_late',
      hint: 'เลย due date แล้ว (ไม่รวมครบวันนี้)',
      route: '/app/projects/board',
      tone: overdueTaskCount > 0 ? 'urgent' : 'neutral',
    };
    const taskDueSoonStat: DashboardStat = {
      label: 'งานใกล้ครบกำหนด',
      value: String(dueSoonCount),
      icon: 'event_upcoming',
      hint: 'ภายใน 7 วัน (รวมครบวันนี้)',
      route: '/app/projects/board',
      tone: dueSoonCount > 0 ? 'warn' : 'neutral',
    };

    if (this.isExecutive()) {
      this.stats.set([
        {
          label: 'มูลค่าสัญญา MA ต่อปี',
          value: thb(maAnnual),
          icon: 'payments',
          hint: `${activeMa.length} สัญญาที่ใช้งาน`,
          route: '/app/ma',
          tone: 'neutral',
        },
        {
          label: 'ปัญหาค้าง',
          value: String(openCount),
          icon: 'support_agent',
          hint: 'คิวบริการหลังการขาย',
          route: '/app/tickets',
          tone: openCount > 0 ? 'warn' : 'neutral',
        },
        taskOverdueStat,
        taskDueSoonStat,
        {
          label: 'อัตรากลับมาซ้ำ',
          value: `${reopenRate}%`,
          icon: 'replay',
          hint: `${reopened} จาก ${data.allTickets.length} ใบ`,
          route: '/app/tickets',
          tone: reopenRate >= 15 ? 'urgent' : reopenRate > 0 ? 'warn' : 'neutral',
        },
        {
          label: 'ความพึงพอใจ',
          value: totalResponses > 0 ? String(totalResponses) : '—',
          icon: 'sentiment_satisfied',
          hint: 'จำนวนคำตอบจากแบบประเมิน',
          route: '/app/surveys',
          tone: 'neutral',
        },
        {
          label: 'ประกันใกล้หมด',
          value: String(data.warranties.length),
          icon: 'verified_user',
          hint: `ภายใน ${WARRANTY_NEAR_EXPIRY_DAYS} วัน`,
          route: '/app/warranties',
          tone: data.warranties.length > 0 ? 'warn' : 'neutral',
        },
        {
          label: 'ความเสี่ยง MA',
          value: String(new Set([...maExpiring30, ...lowQuota].map((c) => c.id)).size),
          icon: 'handshake',
          hint: 'ใกล้หมด 30 วัน หรือโควตาต่ำ',
          route: '/app/ma',
          tone: maExpiring30.length + lowQuota.length > 0 ? 'warn' : 'neutral',
        },
      ]);
    } else {
      this.stats.set([
        {
          label: 'ลูกค้า',
          value: String(data.customers.length),
          icon: 'business',
          hint: 'ทั้งหมดในระบบ',
          route: '/app/customers',
          tone: 'neutral',
        },
        {
          label: 'โครงการเปิดอยู่',
          value: String(openProjects),
          icon: 'folder_special',
          hint: `จาก ${data.projects.length} โครงการ`,
          route: '/app/projects',
          tone: 'neutral',
        },
        {
          label: 'ปัญหาค้าง',
          value: String(openCount),
          icon: 'support_agent',
          hint: 'รอรับ / กำลังทำ / กลับมาซ้ำ',
          route: '/app/tickets',
          tone: openCount > 0 ? 'warn' : 'neutral',
        },
        taskOverdueStat,
        taskDueSoonStat,
        {
          label: 'ติดตามเลยกำหนด',
          value: String(overdueFollowUps.length),
          icon: 'event_available',
          hint: 'แผนที่ยังไม่เสร็จ',
          route: '/app/follow-ups',
          tone: overdueFollowUps.length > 0 ? 'urgent' : 'neutral',
        },
      ]);
    }

    this.openCloseTrend.set(buildOpenCloseTrend(openCount));
    this.billingSlices.set(buildBillingSlices(data.allTickets));
    this.maMonthBars.set(buildMaMonthBars(data.maAll));
    this.csatBars.set(buildCsatBars(data.surveys));

    const risks: RiskAlert[] = [];
    if (maExpiring30.length > 0) {
      risks.push({
        text: `สัญญา MA ใกล้หมดใน 30 วัน ${maExpiring30.length} สัญญา`,
        tone: 'urgent',
        route: '/app/ma',
      });
    }
    if (lowQuota.length > 0) {
      risks.push({
        text: `โควตา MA เหลือน้อย ${lowQuota.length} สัญญา`,
        tone: 'warn',
        route: '/app/ma',
      });
    }
    if (data.warranties.length > 0) {
      risks.push({
        text: `ประกันใกล้หมดอายุ ${data.warranties.length} รายการ`,
        tone: 'warn',
        route: '/app/warranties',
      });
    }
    if (overdueTaskCount > 0) {
      risks.push({
        text: `งานโครงการเกินกำหนด ${overdueTaskCount} รายการ`,
        tone: 'urgent',
        route: '/app/projects/board',
      });
    }
    if (dueSoonCount > 0) {
      risks.push({
        text: `งานใกล้ครบกำหนดภายใน 7 วัน ${dueSoonCount} รายการ`,
        tone: 'warn',
        route: '/app/projects/board',
      });
    }
    if (overdueFollowUps.length > 0) {
      risks.push({
        text: `ติดตามลูกค้าเลยกำหนด ${overdueFollowUps.length} รายการ`,
        tone: 'urgent',
        route: '/app/follow-ups',
      });
    }
    if (openCount > 0) {
      risks.push({
        text: `ปัญหาค้างในคิว ${openCount} ใบ`,
        tone: 'warn',
        route: '/app/tickets',
      });
    }
    if (reopenRate >= 15) {
      risks.push({
        text: `อัตรากลับมาซ้ำสูง ${reopenRate}% — ควรตรวจคุณภาพการแก้`,
        tone: 'urgent',
        route: '/app/tickets',
      });
    }
    if (risks.length === 0) {
      risks.push({
        text: 'ไม่มีจุดเสี่ยงเร่งด่วนจากข้อมูลที่มีตอนนี้',
        tone: 'ok',
        route: '/app/reports',
      });
    }
    this.risks.set(risks.slice(0, 6));
  }
}

function thb(n: number): string {
  const formatted = formatMoneyDisplay(n);
  return formatted ? `฿${formatted}` : '฿0';
}

function buildOpenCloseTrend(openHint = 4): ChartBar[] {
  const scale = Math.max(1, Math.round(openHint / 4));
  const opened = MOCK_OPENED.map((v) => Math.max(1, v + scale - 1));
  const closed = MOCK_CLOSED.map((v) => Math.max(1, v + Math.max(0, scale - 2)));
  const max = Math.max(...opened, ...closed, 1);
  return WEEK_LABELS.map((label, i) => ({
    label,
    value: opened[i],
    percent: Math.round((opened[i] / max) * 100),
    secondary: closed[i],
    secondaryPercent: Math.round((closed[i] / max) * 100),
  }));
}

function buildBillingSlices(tickets: Ticket[]): ChartSlice[] {
  const counts = new Map<BillingType, number>();
  for (const t of tickets) {
    counts.set(t.billingType, (counts.get(t.billingType) ?? 0) + 1);
  }
  const rows = (Object.keys(BILLING_TYPE_LABELS) as BillingType[])
    .map((type) => ({
      label: BILLING_TYPE_LABELS[type],
      value: counts.get(type) ?? 0,
      color: BILLING_COLORS[type],
    }))
    .filter((r) => r.value > 0);

  if (rows.length === 0) {
    return [
      { label: 'ในประกัน', value: 5, color: BILLING_COLORS.WARRANTY },
      { label: 'ใช้โควตา MA', value: 8, color: BILLING_COLORS.MA_QUOTA },
      { label: 'คิดเป็นครั้ง', value: 3, color: BILLING_COLORS.ONE_TIME },
      { label: 'ไม่คิดเงิน', value: 2, color: BILLING_COLORS.FREE },
    ];
  }
  return rows;
}

function buildMaMonthBars(contracts: MaContract[]): ChartBar[] {
  const now = new Date();
  const buckets: { label: string; value: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const label = d.toLocaleDateString('th-TH', { month: 'short' });
    let value = 0;
    for (const c of contracts) {
      if (!c.isCurrentlyActive && c.status !== 'ACTIVE') {
        continue;
      }
      const end = parseDateOnly(c.endDate);
      if (!end) {
        continue;
      }
      if (`${end.getFullYear()}-${end.getMonth()}` === key) {
        value += 1;
      }
    }
    buckets.push({ label, value });
  }

  if (buckets.every((b) => b.value === 0)) {
    const mock = [1, 2, 0, 3, 1, 2];
    const max = Math.max(...mock, 1);
    return buckets.map((b, i) => ({
      label: b.label,
      value: mock[i],
      percent: Math.round((mock[i] / max) * 100),
    }));
  }

  const max = Math.max(...buckets.map((b) => b.value), 1);
  return buckets.map((b) => ({
    label: b.label,
    value: b.value,
    percent: Math.round((b.value / max) * 100),
  }));
}

function buildCsatBars(surveys: Survey[]): ChartBar[] {
  const rows = [...surveys]
    .filter((s) => s.status !== 'DRAFT')
    .sort((a, b) => (b.responseCount || 0) - (a.responseCount || 0))
    .slice(0, 5);
  if (rows.length === 0 || rows.every((s) => !s.responseCount)) {
    return [
      { label: 'ยังไม่มีข้อมูล', value: 0, percent: 0 },
    ];
  }
  const max = Math.max(...rows.map((s) => s.responseCount || 0), 1);
  return rows.map((s) => {
    const label = s.title.length > 14 ? `${s.title.slice(0, 14)}…` : s.title;
    const value = s.responseCount || 0;
    return {
      label,
      value,
      percent: Math.round((value / max) * 100),
    };
  });
}

function conicGradient(slices: ChartSlice[]): string {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) {
    return 'conic-gradient(#e2e8f0 0deg 360deg)';
  }
  let cursor = 0;
  const parts: string[] = [];
  for (const slice of slices) {
    const start = (cursor / total) * 360;
    cursor += slice.value;
    const end = (cursor / total) * 360;
    parts.push(`${slice.color} ${start}deg ${end}deg`);
  }
  return `conic-gradient(${parts.join(', ')})`;
}
