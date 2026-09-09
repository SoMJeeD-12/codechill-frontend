import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import {
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import {
  QUESTION_TYPE_LABELS,
  QuestionType,
  SURVEY_STATUS_LABELS,
  Survey,
  SurveyStatus,
} from '../../core/models/survey.model';
import { SurveyService } from '../../core/services/survey.service';
import { CustomerService } from '../../core/services/customer.service';

@Component({
  selector: 'app-surveys-page',
  standalone: true,
  imports: [
    DatePipe,
    RouterLink,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatDialogModule,
    MatSnackBarModule,
  ],
  templateUrl: './surveys-page.component.html',
  styleUrl: './surveys-page.component.scss',
})
export class SurveysPageComponent implements OnInit {
  private readonly api = inject(SurveyService);
  private readonly customersApi = inject(CustomerService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  readonly surveys = signal<Survey[]>([]);
  readonly search = signal('');
  readonly searchControl = this.fb.nonNullable.control('');
  readonly columns = ['title', 'status', 'questions', 'responses', 'avg', 'updatedAt', 'actions'];
  readonly statusLabels = SURVEY_STATUS_LABELS;

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const list = this.surveys();
    if (!q) {
      return list;
    }
    return list.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        this.statusLabels[s.status].toLowerCase().includes(q)
    );
  });

  ngOnInit(): void {
    this.searchControl.valueChanges.subscribe((v) => this.search.set(v));
    this.customersApi.listCustomers().subscribe({
      next: (customers) => {
        const first = customers[0];
        const second = customers[1];
        if (first) {
          this.api
            .ensureDemoSeed(first.id, second?.id ?? null)
            .subscribe((list) => this.surveys.set(list));
        } else {
          this.reload();
        }
      },
      error: () => this.reload(),
    });
  }

  reload(): void {
    this.api.list().subscribe((list) => this.surveys.set(list));
  }

  statusLabel(status: SurveyStatus): string {
    return this.statusLabels[status];
  }

  responseCount(id: number): number {
    return this.api.summarize(id).responseCount;
  }

  avg(id: number): string {
    const v = this.api.summarize(id).averageRating;
    return v == null ? '—' : String(v);
  }

  openCreate(): void {
    const ref = this.dialog.open(SurveyFormDialogComponent, {
      width: '640px',
      maxWidth: '95vw',
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.reload();
      }
    });
  }

  setStatus(row: Survey, status: SurveyStatus): void {
    this.api.updateStatus(row.id, status).subscribe({
      next: () => {
        this.snack.open('อัปเดตสถานะแล้ว', 'ปิด', { duration: 2200 });
        this.reload();
      },
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
    });
  }
}

@Component({
  selector: 'app-survey-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
  ],
  templateUrl: './survey-form-dialog.component.html',
  styleUrl: './survey-form-dialog.component.scss',
})
export class SurveyFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(SurveyService);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject(MatDialogRef<SurveyFormDialogComponent, boolean>);

  readonly typeLabels = QUESTION_TYPE_LABELS;
  readonly types = Object.keys(QUESTION_TYPE_LABELS) as QuestionType[];
  readonly statusLabels = SURVEY_STATUS_LABELS;
  readonly statuses = Object.keys(SURVEY_STATUS_LABELS) as SurveyStatus[];
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.group({
    title: ['', Validators.required],
    description: [''],
    status: ['DRAFT' as SurveyStatus],
    questions: this.fb.array([this.newQuestion('ความพึงพอใจโดยรวม', 'RATING')]),
  });

  get questions(): FormArray {
    return this.form.get('questions') as FormArray;
  }

  newQuestion(text = '', type: QuestionType = 'RATING') {
    return this.fb.group({
      text: [text, Validators.required],
      type: [type as QuestionType],
      required: [true],
      optionsText: [''],
    });
  }

  addQuestion(): void {
    this.questions.push(this.newQuestion());
  }

  removeQuestion(index: number): void {
    if (this.questions.length <= 1) {
      return;
    }
    this.questions.removeAt(index);
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);
    this.api
      .create({
        title: raw.title ?? '',
        description: raw.description ?? '',
        status: (raw.status as SurveyStatus) ?? 'DRAFT',
        questions: (raw.questions ?? []).map((q) => ({
          text: q?.text ?? '',
          type: (q?.type as QuestionType) ?? 'TEXT',
          required: !!q?.required,
          options: String(q?.optionsText ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        })),
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.snack.open('สร้างแบบประเมินแล้ว', 'ปิด', { duration: 2500 });
          this.ref.close(true);
        },
        error: (err: Error) => {
          this.saving.set(false);
          this.error.set(err.message);
        },
      });
  }
}
