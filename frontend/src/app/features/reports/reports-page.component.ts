import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { ExecutiveReport, ReportService } from '../../core/services/report.service';

@Component({
  selector: 'app-reports-page',
  standalone: true,
  imports: [ThaiDatePipe, RouterLink, MatCardModule, MatButtonModule, MatIconModule],
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
}
