import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { OPEN_PROJECT_STATUSES } from '../models/project.model';
import { WARRANTY_NEAR_EXPIRY_DAYS } from '../models/warranty.model';
import { formatMoneyDisplay } from '../utils/money.util';
import { CustomerService } from './customer.service';
import { FollowUpService } from './follow-up.service';
import { MaService } from './ma.service';
import { ProjectService } from './project.service';
import { SurveyService } from './survey.service';
import { TicketService } from './ticket.service';
import { WarrantyService } from './warranty.service';

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
}

export interface ExecutiveReport {
  generatedAt: string;
  kpis: ReportKpi[];
  revenue: ReportRow[];
  operations: ReportRow[];
  satisfaction: ReportRow[];
  alerts: string[];
}

@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly customers = inject(CustomerService);
  private readonly projects = inject(ProjectService);
  private readonly tickets = inject(TicketService);
  private readonly warranties = inject(WarrantyService);
  private readonly ma = inject(MaService);
  private readonly followUps = inject(FollowUpService);
  private readonly surveys = inject(SurveyService);

  getExecutiveReport(): Observable<ExecutiveReport> {
    return forkJoin({
      warranties: this.warranties
        .listExpiring({ days: WARRANTY_NEAR_EXPIRY_DAYS, limit: 100 })
        .pipe(catchError(() => of([]))),
      followUps: this.followUps
        .list({ overdue: true, limit: 100 })
        .pipe(catchError(() => of([]))),
    }).pipe(map(() => this.buildReport()));
  }

  private buildReport(): ExecutiveReport {
    const customerList = this.customers.customers();
    const projectList = this.projects.projects();
    const ticketList = this.tickets.tickets();
    const contractList = this.ma.contracts();
    const openProjects = projectList.filter((p) => OPEN_PROJECT_STATUSES.includes(p.status));
    const openTickets = this.tickets.openQueue();
    const activeMa = contractList.filter((c) => c.isCurrentlyActive);
    const maAnnual = activeMa.reduce((s, c) => s + (Number(c.price) || 0), 0);
    const projectValue = projectList.reduce((s, c) => s + (c.contractValue ?? 0), 0);
    const nearWarranty = this.warranties.listNearExpiry().length;
    const overdueFollowUps = this.followUps.listOverdue().length;
    const lowQuota = activeMa.filter((c) => this.ma.remainingQuota(c) <= 2).length;

    const surveyAvgs = this.surveys
      .surveys()
      .filter((s) => s.status !== 'DRAFT')
      .map((s) => this.surveys.summarize(s.id).averageRating)
      .filter((v): v is number => v != null);
    const satAvg =
      surveyAvgs.length > 0
        ? Math.round((surveyAvgs.reduce((a, b) => a + b, 0) / surveyAvgs.length) * 10) / 10
        : null;

    const billedTickets = ticketList.filter((t) => (t.extraCharge ?? 0) > 0);
    const ticketRevenue = billedTickets.reduce((s, t) => s + (t.extraCharge ?? 0), 0);

    const alerts: string[] = [];
    if (nearWarranty > 0) {
      alerts.push(`ประกันใกล้หมดอายุ ${nearWarranty} รายการ`);
    }
    if (overdueFollowUps > 0) {
      alerts.push(`ติดตามลูกค้าเลยกำหนด ${overdueFollowUps} รายการ`);
    }
    if (lowQuota > 0) {
      alerts.push(`สัญญา MA โควตาต่ำ ${lowQuota} สัญญา`);
    }
    if (openTickets.length > 0) {
      alerts.push(`ปัญหาค้างในคิว ${openTickets.length} ใบ`);
    }
    if (alerts.length === 0) {
      alerts.push('ไม่มีจุดเตือนเร่งด่วนในขณะนี้');
    }

    const report: ExecutiveReport = {
      generatedAt: new Date().toISOString(),
      kpis: [
        {
          label: 'ลูกค้าทั้งหมด',
          value: String(customerList.length),
          hint: 'รายการในระบบ',
          icon: 'business',
        },
        {
          label: 'โครงการเปิดอยู่',
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
          label: 'ความพึงพอใจเฉลี่ย',
          value: satAvg != null ? String(satAvg) : '—',
          hint: 'จากแบบประเมินที่มีคำตอบ',
          icon: 'sentiment_satisfied',
        },
      ],
      revenue: [
        {
          label: 'มูลค่าโครงการรวม',
          value: projectValue,
          display: this.thb(projectValue),
        },
        {
          label: 'รายได้ MA ต่อปี (สัญญา ACTIVE)',
          value: maAnnual,
          display: this.thb(maAnnual),
        },
        {
          label: 'รายได้จากใบปัญหาคิดเงิน',
          value: ticketRevenue,
          display: this.thb(ticketRevenue),
        },
      ],
      operations: [
        {
          label: 'สัญญา MA ที่ใช้งาน',
          value: activeMa.length,
          display: `${activeMa.length} สัญญา`,
        },
        {
          label: 'ประกันใกล้หมดอายุ (30 วัน)',
          value: nearWarranty,
          display: `${nearWarranty} รายการ`,
        },
        {
          label: 'ติดตามเลยกำหนด',
          value: overdueFollowUps,
          display: `${overdueFollowUps} รายการ`,
        },
        {
          label: 'ใบปัญหาทั้งหมด',
          value: ticketList.length,
          display: `${ticketList.length} ใบ`,
        },
      ],
      satisfaction: this.surveys.surveys().map((s) => {
        const sum = this.surveys.summarize(s.id);
        return {
          label: s.title,
          value: sum.averageRating ?? 0,
          display:
            sum.responseCount === 0
              ? 'ยังไม่มีคำตอบ'
              : `เฉลี่ย ${sum.averageRating ?? '—'} · ${sum.responseCount} คำตอบ`,
        };
      }),
      alerts,
    };

    return report;
  }

  private thb(n: number): string {
    const formatted = formatMoneyDisplay(n);
    return formatted ? `฿${formatted}` : '฿0';
  }
}
