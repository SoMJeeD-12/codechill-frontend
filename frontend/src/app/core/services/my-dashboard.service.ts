import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { apiErrorMessage } from '../http/api-error';
import { toHttpParams } from '../http/api.util';

export type DashboardPeriod = 'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR' | 'CUSTOM';
export type DashboardGroupBy = 'DAY' | 'WEEK' | 'MONTH';

/** null = ผู้ใช้ไม่มีสิทธิ์ดูเรื่องนั้น — ต้องซ่อน ห้ามแสดงเป็น 0 */
export interface MyDashboardTotals {
  projectsDelivered: number | null;
  tasksCompleted: number | null;
  ticketRoundsResolved: number | null;
  followUpsCompleted: number | null;
  communicationsLogged: number | null;
}

export type MyDashboardMetric = keyof MyDashboardTotals;

export interface MyDashboardSeriesPoint extends MyDashboardTotals {
  periodStart: string;
  periodEnd: string;
}

export interface MyDashboard {
  period: DashboardPeriod;
  dateFrom: string;
  dateTo: string;
  groupBy: DashboardGroupBy;
  totals: MyDashboardTotals;
  /** ณ ตอนนี้ ไม่ขึ้นกับช่วงเวลา */
  projectsInProgress: number | null;
  series: MyDashboardSeriesPoint[];
}

/** ห้ามมี userId — แดชบอร์ดเป็นของผู้ล็อกอินเท่านั้น (BE ตอบ 400) */
export interface MyDashboardQuery {
  period?: Exclude<DashboardPeriod, 'CUSTOM'>;
  dateFrom?: string;
  dateTo?: string;
  groupBy?: DashboardGroupBy;
}

@Injectable({ providedIn: 'root' })
export class MyDashboardService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/dashboard/me`;

  get(query: MyDashboardQuery = {}): Observable<MyDashboard> {
    const params =
      query.dateFrom && query.dateTo
        ? { period: 'CUSTOM', dateFrom: query.dateFrom, dateTo: query.dateTo, groupBy: query.groupBy }
        : { period: query.period, groupBy: query.groupBy };
    return this.http
      .get<MyDashboard>(this.url, { params: toHttpParams(params) })
      .pipe(catchError((err) => throwError(() => new Error(apiErrorMessage(err)))));
  }
}
