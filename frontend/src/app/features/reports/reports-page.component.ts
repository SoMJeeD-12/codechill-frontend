import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { DataCompleteness, formatCompleteness } from '../../core/models/report.model';
import { ExecutiveReport, ReportService } from '../../core/services/report.service';
import { BahtPipe } from '../../shared/pipes/baht.pipe';

@Component({
  selector: 'app-reports-page',
  standalone: true,
  imports: [ThaiDatePipe, BahtPipe, RouterLink, MatButtonModule, MatIconModule],
  templateUrl: './reports-page.component.html',
  styleUrl: './reports-page.component.scss',
})
export class ReportsPageComponent implements OnInit {
  private readonly api = inject(ReportService);

  readonly report = signal<ExecutiveReport | null>(null);
  readonly loading = signal(true);

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.api.getExecutiveReport().subscribe((data) => {
      this.report.set(data);
      this.loading.set(false);
    });
  }

  barWidth(value: number, rows: { value: number }[]): number {
    const max = Math.max(...rows.map((r) => r.value), 1);
    return Math.round((value / max) * 100);
  }

  hasExcluded(r: ExecutiveReport): boolean {
    return (Number(r.excludedCancelledValue) || 0) > 0 || (r.excludedCancelledCount ?? 0) > 0;
  }

  formatCompletenessLabel(c: DataCompleteness | null | undefined): string {
    return formatCompleteness(c);
  }
}
