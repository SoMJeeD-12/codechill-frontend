import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, of, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { apiErrorMessage } from '../http/api-error';
import { toHttpParams } from '../http/api.util';
import {
  ContractOverlapReport,
  ContractValueByCustomerReport,
  ContractValueByTypeReport,
  ServiceCostReport,
  UpcomingContractValueReport,
  formatCompleteness,
} from '../models/report.model';
import { Customer } from '../models/customer.model';
import { OPEN_PROJECT_STATUSES, Project } from '../models/project.model';
import { Ticket } from '../models/ticket.model';
import { MaContract } from '../models/ma.model';
import { WARRANTY_NEAR_EXPIRY_DAYS, Warranty } from '../models/warranty.model';
import { formatMoneyDisplay } from '../utils/money.util';
import { CustomerService } from './customer.service';
import { FollowUpService } from './follow-up.service';
import { MaService } from './ma.service';
import { ProjectService } from './project.service';
import { SurveyService } from './survey.service';
import { TicketService } from './ticket.service';
import { WarrantyService } from './warranty.service';

export interface ReportDateRange {
  dateFrom?: string;
  dateTo?: string;
  [key: string]: string | number | boolean | null | undefined;
}

export interface ReportKpi {
  label: string;
  value: string;
  hint: string;
  icon: string;
}

export interface ReportRow {
  label: string;
  value: number;
  display: string;
  note?: string;
}

/** รายการใกล้หมดอายุจริง — ไม่ได้มาจาก contract-value/upcoming */
export interface NearExpiryItem {
  kind: 'ma' | 'warranty';
  id: number;
  title: string;
  meta: string;
  endDate: string;
  daysRemaining: number;
  link: string[];
  queryParams?: Record<string, string>;
}

export interface ExecutiveReport {
  generatedAt: string;
  disclaimer: string;
  kpis: ReportKpi[];
  contractValue: ReportRow[];
  ranking: Array<{
    customerId: number;
    label: string;
    display: string;
    value: number;
    overlappingContractCount: number;
  }>;
  grandTotalContractValue: string;
  excludedCancelledValue: string;
  excludedCancelledCount: number;
  oneTimeCompletenessLabel: string;
  /** สัญญาที่ยังคุ้มครอง — คนละความหมายกับใกล้หมดอายุ */
  upcoming: UpcomingContractValueReport | null;
  /** เกณฑ์เดียวกับการ์ดหน้าแรก: ภายใน 30 วัน */
  nearExpiryDays: number;
  nearExpiry: NearExpiryItem[];
  serviceCost: ServiceCostReport | null;
  overlaps: ContractOverlapReport | null;
  operations: ReportRow[];
  satisfaction: ReportRow[];
  alerts: string[];
}

@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/reports`;
  private readonly customers = inject(CustomerService);
  private readonly projects = inject(ProjectService);
  private readonly tickets = inject(TicketService);
  private readonly warranties = inject(WarrantyService);
  private readonly ma = inject(MaService);
  private readonly followUps = inject(FollowUpService);
  private readonly surveys = inject(SurveyService);

  byCustomer(
    params: ReportDateRange & { limit?: number } = { limit: 10 }
  ): Observable<ContractValueByCustomerReport> {
    return this.http
      .get<ContractValueByCustomerReport>(`${this.base}/contract-value/by-customer`, {
        params: toHttpParams({ ...params }),
      })
      .pipe(catchError((err) => throwApi(err)));
  }

  byType(params: ReportDateRange = {}): Observable<ContractValueByTypeReport> {
    return this.http
      .get<ContractValueByTypeReport>(`${this.base}/contract-value/by-type`, {
        params: toHttpParams({ ...params }),
      })
      .pipe(catchError((err) => throwApi(err)));
  }

  upcoming(): Observable<UpcomingContractValueReport> {
    return this.http
      .get<UpcomingContractValueReport>(`${this.base}/contract-value/upcoming`)
      .pipe(catchError((err) => throwApi(err)));
  }

  serviceCost(
    params: ReportDateRange & { customerId?: number } = {}
  ): Observable<ServiceCostReport> {
    return this.http
      .get<ServiceCostReport>(`${this.base}/service-cost`, {
        params: toHttpParams({ ...params }),
      })
      .pipe(catchError((err) => throwApi(err)));
  }

  overlaps(customerId?: number): Observable<ContractOverlapReport> {
    return this.http
      .get<ContractOverlapReport>(`${this.base}/ma-contract-overlaps`, {
        params: toHttpParams({ customerId }),
      })
      .pipe(catchError((err) => throwApi(err)));
  }

  getExecutiveReport(range: ReportDateRange = {}): Observable<ExecutiveReport> {
    return forkJoin({
      byType: this.byType(range).pipe(catchError(() => of(null))),
      byCustomer: this.byCustomer({ ...range, limit: 10 }).pipe(catchError(() => of(null))),
      upcoming: this.upcoming().pipe(catchError(() => of(null))),
      serviceCost: this.serviceCost(range).pipe(catchError(() => of(null))),
      overlaps: this.overlaps().pipe(catchError(() => of(null))),
      warranties: this.warranties
        .listExpiring({ days: WARRANTY_NEAR_EXPIRY_DAYS, limit: 100 })
        .pipe(catchError(() => of([] as Warranty[]))),
      expiringMa: this.ma
        .listExpiring(WARRANTY_NEAR_EXPIRY_DAYS)
        .pipe(catchError(() => of([] as MaContract[]))),
      followUps: this.followUps.list({ overdue: true, limit: 100 }).pipe(catchError(() => of([]))),
      surveys: this.surveys.list().pipe(catchError(() => of([]))),
      // ต้องโหลดเองที่นี่ — ห้ามพึ่ง cache ของหน้าอื่น
      // ไม่งั้นเปิดหน้ารายงานตรง ๆ ตัวเลขด้านบนจะขึ้น 0 ทั้งที่มีข้อมูลจริง
      customers: this.customers.listCustomers({ limit: 100 }).pipe(catchError(() => of([]))),
      projects: this.projects.listProjects({ limit: 100 }).pipe(catchError(() => of([]))),
      tickets: this.tickets.listPending({ limit: 100 }).pipe(catchError(() => of([]))),
    }).pipe(map((data) => this.buildReport(data)));
  }

  private buildReport(data: {
    byType: ContractValueByTypeReport | null;
    byCustomer: ContractValueByCustomerReport | null;
    upcoming: UpcomingContractValueReport | null;
    serviceCost: ServiceCostReport | null;
    overlaps: ContractOverlapReport | null;
    warranties: Warranty[];
    expiringMa: MaContract[];
    followUps: unknown[];
    surveys: Array<{ title: string; id: number; responseCount: number }>;
    customers: Customer[];
    projects: Project[];
    tickets: Ticket[];
  }): ExecutiveReport {
    const customerList = data.customers;
    const projectList = data.projects;
    const openProjects = projectList.filter((p) => OPEN_PROJECT_STATUSES.includes(p.status));
    const openTickets = data.tickets;
    const nearWarranty = data.warranties.length;
    const expiringMa = data.expiringMa.length;
    const overdueFollowUps = data.followUps.length;
    const byType = data.byType;
    const byCustomer = data.byCustomer;

    const alerts: string[] = [];
    if (nearWarranty > 0) {
      alerts.push(`ประกันใกล้หมดอายุ ${nearWarranty} รายการ (ภายใน ${WARRANTY_NEAR_EXPIRY_DAYS} วัน)`);
    }
    if (expiringMa > 0) {
      alerts.push(
        `สัญญา MA ใกล้หมดอายุ ${expiringMa} รายการ (ภายใน ${WARRANTY_NEAR_EXPIRY_DAYS} วัน)`
      );
    }
    if (overdueFollowUps > 0) {
      alerts.push(`ติดตามลูกค้าเลยกำหนด ${overdueFollowUps} รายการ`);
    }
    if ((data.upcoming?.overlappingContractCount ?? 0) > 0) {
      alerts.push(
        `มีสัญญา MA ช่วงเวลาซ้อนกัน ${data.upcoming!.overlappingContractCount} รายการ — ยอดอาจนับซ้ำ`
      );
    }
    if (openTickets.length > 0) {
      alerts.push(`ปัญหาค้างในคิว ${openTickets.length} ใบ`);
    }
    if (alerts.length === 0) {
      alerts.push('ไม่มีจุดเตือนเร่งด่วนในขณะนี้');
    }

    const contractValue: ReportRow[] = byType
      ? [
          {
            label: 'มูลค่าตามสัญญาจากโปรเจค',
            value: Number(byType.projectContractValue) || 0,
            display: this.thb(byType.projectContractValue),
            note: `${byType.projectCount} โปรเจค`,
          },
          {
            label: 'มูลค่าตามสัญญา MA',
            value: Number(byType.maContractValue) || 0,
            display: this.thb(byType.maContractValue),
            note: `${byType.maContractCount} สัญญา`,
          },
          {
            label: 'มูลค่าของเสริม MA',
            value: Number(byType.maAddonValue) || 0,
            display: this.thb(byType.maAddonValue),
            note: `${byType.maAddonCount} รายการ`,
          },
          {
            label: 'ค่าบริการรายครั้ง (ที่กรอกไว้)',
            value: Number(byType.oneTimeChargeValue) || 0,
            display: this.thb(byType.oneTimeChargeValue),
            note: formatCompleteness(byType.oneTimeCompleteness),
          },
        ]
      : [];

    return {
      generatedAt: new Date().toISOString(),
      disclaimer:
        byType?.disclaimer ||
        byCustomer?.disclaimer ||
        'ตัวเลขทั้งหมดเป็นมูลค่าตามสัญญา ไม่ใช่ยอดที่เรียกเก็บหรือรับชำระจริง',
      kpis: [
        {
          label: 'ลูกค้าทั้งหมด',
          value: String(customerList.length),
          hint: 'รายการในระบบ',
          icon: 'business',
        },
        {
          label: 'โปรเจคเปิดอยู่',
          value: String(openProjects.length),
          hint: `จากทั้งหมด ${projectList.length}`,
          icon: 'folder_special',
        },
        {
          label: 'ปัญหาในคิว',
          value: String(openTickets.length),
          hint: 'รอรับ / กำลังทำ / กลับมาซ้ำ',
          icon: 'support_agent',
        },
        {
          label: 'มูลค่าตามสัญญารวม',
          value: byType ? this.thb(byType.totalContractValue) : '—',
          hint: 'จากรายงาน API',
          icon: 'payments',
        },
      ],
      contractValue,
      ranking: (byCustomer?.items ?? []).map((row) => ({
        customerId: row.customerId,
        label: row.customerName,
        display: this.thb(row.totalContractValue),
        value: Number(row.totalContractValue) || 0,
        overlappingContractCount: row.overlappingContractCount,
      })),
      grandTotalContractValue: byCustomer?.grandTotalContractValue ?? byType?.totalContractValue ?? '0',
      excludedCancelledValue:
        byCustomer?.excludedCancelledValue ?? byType?.excludedCancelledValue ?? '0',
      excludedCancelledCount:
        byCustomer?.excludedCancelledCount ?? byType?.excludedCancelledCount ?? 0,
      oneTimeCompletenessLabel: formatCompleteness(
        byCustomer?.oneTimeCompleteness ?? byType?.oneTimeCompleteness
      ),
      upcoming: data.upcoming,
      nearExpiryDays: WARRANTY_NEAR_EXPIRY_DAYS,
      nearExpiry: this.nearExpiryItems(data.warranties, data.expiringMa),
      serviceCost: data.serviceCost,
      overlaps: data.overlaps,
      operations: [
        {
          label: 'สัญญา MA ที่ยังคุ้มครองอยู่',
          value: data.upcoming?.contractCount ?? 0,
          display: `${data.upcoming?.contractCount ?? 0} สัญญา`,
        },
        {
          label: 'ประกันใกล้หมดอายุ (30 วัน)',
          value: nearWarranty,
          display: `${nearWarranty} รายการ`,
        },
        {
          label: 'สัญญา MA ใกล้หมดอายุ (30 วัน)',
          value: expiringMa,
          display: `${expiringMa} รายการ`,
        },
        {
          label: 'ติดตามเลยกำหนด',
          value: overdueFollowUps,
          display: `${overdueFollowUps} รายการ`,
        },
        {
          label: 'ชั่วโมงบริการรวม',
          value: Number(data.serviceCost?.totalHours) || 0,
          display: data.serviceCost
            ? `${data.serviceCost.totalHours} ชม. (${formatCompleteness(data.serviceCost.completeness)})`
            : '—',
        },
      ],
      satisfaction: data.surveys.map((s) => ({
        label: s.title,
        value: s.responseCount,
        display: `${s.responseCount} คำตอบ`,
      })),
      alerts,
    };
  }

  private nearExpiryItems(warranties: Warranty[], contracts: MaContract[]): NearExpiryItem[] {
    const days = WARRANTY_NEAR_EXPIRY_DAYS;
    const warrantyRows: NearExpiryItem[] = warranties.map((w) => ({
      kind: 'warranty',
      id: w.id,
      title: w.code?.trim() || w.delivery?.title || `ประกัน #${w.id}`,
      meta: [w.project?.customerName, w.project?.name].filter(Boolean).join(' · ') || 'ประกัน',
      endDate: w.endDate,
      daysRemaining: w.daysRemaining,
      link: ['/app/warranties'],
      queryParams: { expiring: String(days) },
    }));
    const maRows: NearExpiryItem[] = contracts.map((c) => ({
      kind: 'ma',
      id: c.id,
      title: c.contractNo?.trim() || `สัญญา #${c.id}`,
      meta: c.customerName?.trim() || c.projectName?.trim() || 'สัญญา MA',
      endDate: c.endDate,
      daysRemaining: c.daysUntilExpiry,
      link: ['/app/ma', String(c.id)],
    }));
    return [...warrantyRows, ...maRows].sort((a, b) => a.daysRemaining - b.daysRemaining);
  }

  private thb(n: string | number): string {
    const formatted = formatMoneyDisplay(n);
    return formatted ? `฿${formatted}` : '฿0';
  }
}

function throwApi(err: unknown): Observable<never> {
  return throwError(() => new Error(apiErrorMessage(err)));
}
