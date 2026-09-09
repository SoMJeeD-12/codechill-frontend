import { Location } from '@angular/common';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import {
  QUESTION_TYPE_LABELS,
  QuestionType,
  SURVEY_STATUS_LABELS,
  Survey,
  SurveyAnswer,
  SurveyQuestion,
  SurveyResponse,
} from '../../core/models/survey.model';
import { AuthService } from '../../core/services/auth.service';
import { CustomerService } from '../../core/services/customer.service';
import { SurveyService, SurveySummary } from '../../core/services/survey.service';
import { navigateBack } from '../../core/utils/navigation.util';

@Component({
  selector: 'app-survey-detail-page',
  standalone: true,
  imports: [
    ThaiDatePipe,
        ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatRadioModule,
    MatTableModule,
    MatSnackBarModule,
  ],
  templateUrl: './survey-detail-page.component.html',
  styleUrl: './survey-detail-page.component.scss',
})
export class SurveyDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly api = inject(SurveyService);
  private readonly customersApi = inject(CustomerService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly snack = inject(MatSnackBar);

  readonly survey = signal<Survey | null>(null);
  readonly responses = signal<SurveyResponse[]>([]);
  readonly summary = signal<SurveySummary | null>(null);
  readonly notFound = signal(false);
  readonly statusLabels = SURVEY_STATUS_LABELS;
  readonly typeLabels = QUESTION_TYPE_LABELS;
  readonly customers = this.customersApi.customers;
  readonly columns = ['customer', 'avg', 'by', 'at'];
  readonly saving = signal(false);

  readonly responseForm = this.fb.group({
    customerId: [0, Validators.min(1)],
  });

  /** answer controls keyed by question id */
  answerControls: Record<number, FormControl<string | number | null>> = {};

  goBack(): void {
    navigateBack(this.location, this.router, '/app/surveys');
  }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.reload(id);
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
        this.api.listResponses(surveyId).subscribe((rows) => this.responses.set(rows));
        this.summary.set(this.api.summarize(surveyId));
        this.buildAnswerControls(row.questions);
        const first = this.customers()[0];
        this.responseForm.patchValue({ customerId: first?.id ?? 0 });
      },
      error: () => this.notFound.set(true),
    });
  }

  buildAnswerControls(questions: SurveyQuestion[]): void {
    this.answerControls = {};
    for (const q of questions) {
      this.answerControls[q.id] = new FormControl<string | number | null>(
        q.type === 'RATING' ? null : '',
        q.required ? Validators.required : null
      );
    }
  }

  customerName(id: number): string {
    return this.customersApi.getCustomer(id)?.name ?? `#${id}`;
  }

  statusLabel(status: Survey['status']): string {
    return this.statusLabels[status];
  }

  typeLabel(type: QuestionType): string {
    return this.typeLabels[type];
  }

  distPercent(score: 1 | 2 | 3 | 4 | 5): number {
    const sum = this.summary();
    if (!sum || sum.responseCount === 0) {
      return 0;
    }
    const values = Object.values(sum.ratingDistribution) as number[];
    const totalRatings = values.reduce((a, b) => a + b, 0);
    if (!totalRatings) {
      return 0;
    }
    return Math.round((sum.ratingDistribution[score] / totalRatings) * 100);
  }

  submit(): void {
    const s = this.survey();
    if (!s) {
      return;
    }
    if (this.responseForm.invalid) {
      this.responseForm.markAllAsTouched();
      return;
    }
    const answers: SurveyAnswer[] = s.questions.map((q) => {
      const raw = this.answerControls[q.id].value;
      const value =
        q.type === 'RATING' ? (raw == null || raw === '' ? '' : Number(raw)) : String(raw ?? '');
      return { questionId: q.id, value };
    });
    this.saving.set(true);
    this.api
      .submitResponse(s.id, {
        customerId: Number(this.responseForm.getRawValue().customerId),
        answers,
        submittedByName: this.auth.currentUser()?.fullName ?? 'ไม่ระบุ',
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.snack.open('บันทึกคำตอบแล้ว', 'ปิด', { duration: 2500 });
          this.reload();
        },
        error: (err: Error) => {
          this.saving.set(false);
          this.snack.open(err.message, 'ปิด', { duration: 3500 });
        },
      });
  }
}
