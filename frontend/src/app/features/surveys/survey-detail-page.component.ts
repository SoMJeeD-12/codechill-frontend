import { DecimalPipe, Location } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  ASSIGNMENT_STATUS_LABELS,
  AssignmentStatus,
  SURVEY_STATUS_LABELS,
  Survey,
  SurveyAssignment,
  SurveyResponseDetail,
  SurveyScoreBreakdown,
  SurveySummary,
} from '../../core/models/survey.model';
import { SurveyService } from '../../core/services/survey.service';
import { printSurveyForm } from './survey-print';
import { navigateBack } from '../../core/utils/navigation.util';
import { THAI_MONTHS_SHORT, toDateOnlyString } from '../../core/utils/date.util';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { createClientPager } from '../../shared/utils/client-pager';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';

@Component({
  selector: 'app-survey-detail-page',
  standalone: true,
  imports: [
    DecimalPipe,
    ThaiDatePipe,
    RouterLink,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatTableModule,
    MatSnackBarModule,
    TablePaginatorComponent,
  ],
  templateUrl: './survey-detail-page.component.html',
  styleUrl: './survey-detail-page.component.scss',
})
export class SurveyDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly api = inject(SurveyService);
  private readonly fb = inject(FormBuilder);
  private readonly snack = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  readonly survey = signal<Survey | null>(null);
  readonly responses = signal<SurveyResponseDetail[]>([]);
  readonly assignments = signal<SurveyAssignment[]>([]);
  readonly summary = signal<SurveySummary | null>(null);
  readonly breakdown = signal<SurveyScoreBreakdown | null>(null);
  readonly breakdownLoading = signal(false);
  readonly notFound = signal(false);
  readonly statusLabels = SURVEY_STATUS_LABELS;
  readonly assignmentStatusLabels = ASSIGNMENT_STATUS_LABELS;
  readonly responseColumns = ['customer', 'score', 'at'];
  readonly assignmentColumns = ['customer', 'project', 'status', 'sentAt', 'answeredAt'];

  /** เรียงคะแนนมาก → น้อย สำหรับกราฟ · ไม่มีคะแนนไว้ท้าย */
  readonly breakdownByCustomer = computed(() =>
    [...(this.breakdown()?.byCustomer ?? [])].sort(
      (a, b) => (b.averageScore ?? -1) - (a.averageScore ?? -1)
    )
  );
  readonly breakdownByCustomerPager = createClientPager(this.breakdownByCustomer);
  readonly assignmentsPager = createClientPager(this.assignments);
  readonly responsesPager = createClientPager(this.responses);

  readonly breakdownRange = this.fb.nonNullable.group({
    dateFrom: [defaultBreakdownFrom()],
    dateTo: [defaultBreakdownTo()],
  });

  readonly ratingQuestionSummaries = computed(() => {
    const sum = this.summary();
    if (!sum) {
      return [];
    }
    return sum.questions.filter((q) => q.questionType === 'RATING');
  });

  goBack(): void {
    navigateBack(this.location, this.router, '/app/surveys');
  }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.reload(id);
    this.breakdownRange.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadBreakdown());
  }

  reload(id?: number): void {
    const surveyId = id ?? this.survey()?.id;
    if (!surveyId) {
      return;
    }
    this.api.get(surveyId).subscribe({
      next: (row) => {
        this.notFound.set(false);
        this.survey.set(row);
        forkJoin({
          summary: this.api.getSummary(surveyId).pipe(catchError(() => of(null))),
          assignments: this.api
            .listAssignments(surveyId)
            .pipe(catchError(() => of([] as SurveyAssignment[]))),
          responses: this.api
            .listResponses(surveyId)
            .pipe(catchError(() => of([] as SurveyResponseDetail[]))),
        }).subscribe(({ summary, assignments, responses }) => {
          this.summary.set(summary);
          this.assignments.set(assignments);
          this.responses.set(responses);
          this.loadBreakdown(surveyId);
        });
      },
      error: () => this.notFound.set(true),
    });
  }

  loadBreakdown(surveyId?: number): void {
    const id = surveyId ?? this.survey()?.id;
    if (!id) {
      return;
    }
    const range = this.breakdownRange.getRawValue();
    const dateFrom = toDateOnlyString(range.dateFrom);
    const dateTo = toDateOnlyString(range.dateTo);
    this.breakdownLoading.set(true);
    this.api.getScoreBreakdown(id, { dateFrom, dateTo }).subscribe({
      next: (row) => {
        this.breakdown.set(row);
        this.breakdownLoading.set(false);
      },
      error: (err: Error) => {
        this.breakdown.set(null);
        this.breakdownLoading.set(false);
        this.snack.open(err.message, 'ปิด', { duration: 3500 });
      },
    });
  }

  monthBarPercent(score: number | null): number {
    if (score == null) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round((score / 5) * 100)));
  }

  /** '2026-09' → 'ก.ย. 2026' (ค.ศ.) */
  monthLabel(month: string): string {
    const [y, m] = month.split('-').map(Number);
    if (!y || !m || m < 1 || m > 12) {
      return month;
    }
    return `${THAI_MONTHS_SHORT[m - 1]} ${y}`;
  }

  scoreWithCount(avg: number | null, scoredCount: number): string {
    if (avg == null) {
      return '—';
    }
    return `${Number(avg).toFixed(2)} (จาก ${scoredCount} คำตอบ)`;
  }

  printForm(): void {
    const id = this.survey()?.id;
    if (!id) {
      return;
    }
    printSurveyForm(this.api, this.snack, id);
  }

  statusLabel(status: Survey['status']): string {
    return this.statusLabels[status];
  }

  assignmentStatusLabel(status: AssignmentStatus): string {
    return this.assignmentStatusLabels[status];
  }

  scoreDisplay(score: number | null | undefined): string {
    return score == null ? '—' : Number(score).toFixed(2);
  }

  ratingBarPercent(averageScore: number | null | undefined): number {
    if (averageScore == null) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round((averageScore / 5) * 100)));
  }
}

function defaultBreakdownTo(): Date {
  return new Date();
}

function defaultBreakdownFrom(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - 5);
  d.setDate(1);
  return d;
}
