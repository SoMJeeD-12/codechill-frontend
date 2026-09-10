import { Location } from '@angular/common';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  ASSIGNMENT_STATUS_LABELS,
  AssignmentStatus,
  QUESTION_TYPE_LABELS,
  QuestionType,
  SURVEY_STATUS_LABELS,
  Survey,
  SurveyAnswerInput,
  SurveyAssignment,
  SurveyQuestion,
  SurveyResponseDetail,
  SurveyScoreBreakdown,
  SurveySummary,
} from '../../core/models/survey.model';
import { Contact, Customer } from '../../core/models/customer.model';
import { Project } from '../../core/models/project.model';
import { CustomerService } from '../../core/services/customer.service';
import { ProjectService } from '../../core/services/project.service';
import { SurveyService } from '../../core/services/survey.service';
import { navigateBack } from '../../core/utils/navigation.util';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { createClientPager } from '../../shared/utils/client-pager';

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
    MatCheckboxModule,
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
  private readonly customersApi = inject(CustomerService);
  private readonly projectsApi = inject(ProjectService);
  private readonly fb = inject(FormBuilder);
  private readonly snack = inject(MatSnackBar);

  readonly survey = signal<Survey | null>(null);
  readonly responses = signal<SurveyResponseDetail[]>([]);
  readonly assignments = signal<SurveyAssignment[]>([]);
  readonly summary = signal<SurveySummary | null>(null);
  readonly breakdown = signal<SurveyScoreBreakdown | null>(null);
  readonly breakdownLoading = signal(false);
  readonly notFound = signal(false);
  readonly statusLabels = SURVEY_STATUS_LABELS;
  readonly typeLabels = QUESTION_TYPE_LABELS;
  readonly assignmentStatusLabels = ASSIGNMENT_STATUS_LABELS;
  readonly customers = signal<Customer[]>([]);
  readonly contacts = signal<Contact[]>([]);
  readonly projects = signal<Project[]>([]);
  readonly responseColumns = ['customer', 'score', 'at'];
  readonly assignmentColumns = ['customer', 'status', 'sentAt', 'answeredAt'];
  readonly savingAssignment = signal(false);
  readonly savingResponse = signal(false);

  readonly breakdownByCustomer = computed(() => this.breakdown()?.byCustomer ?? []);
  readonly breakdownByCustomerPager = createClientPager(this.breakdownByCustomer);
  readonly assignmentsPager = createClientPager(this.assignments);
  readonly responsesPager = createClientPager(this.responses);

  readonly assignmentForm = this.fb.group({
    customerId: [0, Validators.min(1)],
    contactId: [null as number | null],
    projectId: [null as number | null],
  });

  readonly answerForm = this.fb.group({
    assignmentId: [0, Validators.min(1)],
    comment: [''],
  });

  readonly breakdownRange = this.fb.nonNullable.group({
    dateFrom: [defaultBreakdownFrom()],
    dateTo: [defaultBreakdownTo()],
  });

  /** answer controls keyed by question id */
  answerControls: Record<number, FormControl<string | number | string[] | null>> = {};

  readonly sentAssignments = computed(() =>
    this.assignments().filter((a) => a.status === 'SENT')
  );

  readonly ratingQuestionSummaries = computed(() => {
    const sum = this.summary();
    if (!sum) {
      return [];
    }
    return sum.questions.filter((q) => q.questionType === 'RATING');
  });

  readonly customerProjects = computed(() => {
    const customerId = this.assignmentForm.controls.customerId.value;
    const list = this.projects();
    if (!customerId) {
      return list;
    }
    return list.filter((p) => p.customerId === customerId);
  });

  goBack(): void {
    navigateBack(this.location, this.router, '/app/surveys');
  }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.customersApi.listCustomers({ limit: 100 }).subscribe({
      next: (rows) => {
        this.customers.set(rows);
        const first = rows[0];
        if (first) {
          this.assignmentForm.patchValue({ customerId: first.id });
          this.onCustomerChange(first.id);
        }
      },
      error: () => undefined,
    });
    this.projectsApi.listProjects({ limit: 100 }).subscribe({
      next: (rows) => this.projects.set(rows),
      error: () => undefined,
    });
    this.assignmentForm.controls.customerId.valueChanges.subscribe((customerId) => {
      this.onCustomerChange(Number(customerId) || 0);
    });
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
        this.buildAnswerControls(row.questions);
        forkJoin({
          summary: this.api.getSummary(surveyId).pipe(catchError(() => of(null))),
          assignments: this.api.listAssignments(surveyId).pipe(catchError(() => of([] as SurveyAssignment[]))),
          responses: this.api.listResponses(surveyId).pipe(catchError(() => of([] as SurveyResponseDetail[]))),
        }).subscribe(({ summary, assignments, responses }) => {
          this.summary.set(summary);
          this.assignments.set(assignments);
          this.responses.set(responses);
          const firstSent = assignments.find((a) => a.status === 'SENT');
          this.answerForm.patchValue({ assignmentId: firstSent?.id ?? 0, comment: '' });
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
    const { dateFrom, dateTo } = this.breakdownRange.getRawValue();
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

  scoreWithCount(avg: number | null, scoredCount: number): string {
    if (avg == null) {
      return '—';
    }
    return `${Number(avg).toFixed(2)} (จาก ${scoredCount} คำตอบ)`;
  }

  onCustomerChange(customerId: number): void {
    this.assignmentForm.patchValue({ contactId: null, projectId: null }, { emitEvent: false });
    this.contacts.set([]);
    if (!customerId) {
      return;
    }
    this.customersApi.listContacts(customerId).subscribe({
      next: (rows) => this.contacts.set(rows),
      error: () => this.contacts.set([]),
    });
  }

  buildAnswerControls(questions: SurveyQuestion[]): void {
    this.answerControls = {};
    for (const q of questions) {
      const initial =
        q.questionType === 'RATING'
          ? null
          : q.questionType === 'MULTI_CHOICE'
            ? ([] as string[])
            : '';
      this.answerControls[q.id] = new FormControl<string | number | string[] | null>(
        initial,
        q.isRequired ? Validators.required : null
      );
    }
  }

  statusLabel(status: Survey['status']): string {
    return this.statusLabels[status];
  }

  typeLabel(type: QuestionType): string {
    return this.typeLabels[type];
  }

  assignmentStatusLabel(status: AssignmentStatus): string {
    return this.assignmentStatusLabels[status];
  }

  scoreDisplay(score: number | null | undefined): string {
    return score == null ? '—' : String(score);
  }

  ratingRange(q: SurveyQuestion): number[] {
    const min = q.minValue ?? 1;
    const max = q.maxValue ?? 5;
    const start = Math.min(min, max);
    const end = Math.max(min, max);
    const out: number[] = [];
    for (let n = start; n <= end; n++) {
      out.push(n);
    }
    return out;
  }

  ratingBarPercent(averageScore: number | null | undefined): number {
    if (averageScore == null) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round((averageScore / 5) * 100)));
  }

  isChoiceChecked(questionId: number, option: string): boolean {
    const value = this.answerControls[questionId]?.value;
    return Array.isArray(value) && value.includes(option);
  }

  toggleChoice(questionId: number, option: string, checked: boolean): void {
    const ctrl = this.answerControls[questionId];
    if (!ctrl) {
      return;
    }
    const current = Array.isArray(ctrl.value) ? [...ctrl.value] : [];
    const next = checked
      ? current.includes(option)
        ? current
        : [...current, option]
      : current.filter((v) => v !== option);
    ctrl.setValue(next);
    ctrl.markAsTouched();
  }

  createAssignment(): void {
    const s = this.survey();
    if (!s) {
      return;
    }
    if (!s.isCurrentlyUsable) {
      this.snack.open('แบบประเมินนี้ยังใช้บันทึกการส่งไม่ได้ในตอนนี้', 'ปิด', { duration: 3500 });
      return;
    }
    if (this.assignmentForm.invalid) {
      this.assignmentForm.markAllAsTouched();
      return;
    }
    const raw = this.assignmentForm.getRawValue();
    this.savingAssignment.set(true);
    this.api
      .createAssignment(s.id, {
        customerId: Number(raw.customerId),
        contactId: raw.contactId || null,
        projectId: raw.projectId || null,
      })
      .subscribe({
        next: () => {
          this.savingAssignment.set(false);
          this.snack.open('บันทึกการส่งแล้ว', 'ปิด', { duration: 2500 });
          this.reload();
        },
        error: (err: Error) => {
          this.savingAssignment.set(false);
          this.snack.open(err.message, 'ปิด', { duration: 3500 });
        },
      });
  }

  submitAnswers(): void {
    const s = this.survey();
    if (!s) {
      return;
    }
    if (!s.isCurrentlyUsable) {
      this.snack.open('แบบประเมินนี้ยังใช้บันทึกคำตอบไม่ได้ในตอนนี้', 'ปิด', { duration: 3500 });
      return;
    }
    if (this.answerForm.invalid) {
      this.answerForm.markAllAsTouched();
      return;
    }
    for (const q of s.questions) {
      const ctrl = this.answerControls[q.id];
      if (q.isRequired && (ctrl.invalid || this.isEmptyAnswer(q, ctrl.value))) {
        ctrl.markAsTouched();
        this.snack.open('กรุณากรอกคำตอบที่จำเป็นให้ครบ', 'ปิด', { duration: 3000 });
        return;
      }
    }

    const answers: SurveyAnswerInput[] = s.questions.map((q) => {
      const raw = this.answerControls[q.id].value;
      if (q.questionType === 'RATING') {
        return {
          questionId: q.id,
          answerNumber: raw == null || raw === '' ? null : Number(raw),
        };
      }
      if (q.questionType === 'CHOICE') {
        return {
          questionId: q.id,
          answerText: raw ? String(raw) : '',
        };
      }
      if (q.questionType === 'MULTI_CHOICE') {
        return {
          questionId: q.id,
          answerChoices: Array.isArray(raw) ? raw : [],
        };
      }
      // TEXT
      return {
        questionId: q.id,
        answerText: String(raw ?? ''),
      };
    });

    const assignmentId = Number(this.answerForm.getRawValue().assignmentId);
    const comment = this.answerForm.getRawValue().comment?.trim() || null;
    this.savingResponse.set(true);
    this.api
      .submitAssignmentResponse(assignmentId, { answers, comment })
      .subscribe({
        next: () => {
          this.savingResponse.set(false);
          this.snack.open('บันทึกคำตอบแล้ว', 'ปิด', { duration: 2500 });
          this.reload();
        },
        error: (err: Error) => {
          this.savingResponse.set(false);
          this.snack.open(err.message, 'ปิด', { duration: 3500 });
        },
      });
  }

  private isEmptyAnswer(q: SurveyQuestion, value: string | number | string[] | null): boolean {
    if (q.questionType === 'MULTI_CHOICE') {
      return !Array.isArray(value) || value.length === 0;
    }
    if (q.questionType === 'RATING') {
      return value == null || value === '';
    }
    return value == null || String(value).trim() === '';
  }
}

function defaultBreakdownTo(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function defaultBreakdownFrom(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 5);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}
