import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
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
import { MatMenuModule } from '@angular/material/menu';
import {
  QUESTION_TYPE_LABELS,
  QuestionType,
  SURVEY_STATUS_LABELS,
  Survey,
  SurveyStatus,
} from '../../core/models/survey.model';
import { SurveyService } from '../../core/services/survey.service';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { createClientPager } from '../../shared/utils/client-pager';
import { FORM_DIALOG } from '../../shared/utils/form-dialog';
import { openConfirmDialog } from '../../shared/components/confirm-dialog.component';

@Component({
  selector: 'app-surveys-page',
  standalone: true,
  imports: [
    ThaiDatePipe,
    RouterLink,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatDialogModule,
    MatSnackBarModule,
    MatMenuModule,
    TablePaginatorComponent,
  ],
  templateUrl: './surveys-page.component.html',
  styleUrl: './surveys-page.component.scss',
})
export class SurveysPageComponent implements OnInit {
  private readonly api = inject(SurveyService);
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
        (s.description ?? '').toLowerCase().includes(q) ||
        this.statusLabels[s.status].toLowerCase().includes(q)
    );
  });

  readonly pager = createClientPager(this.filtered);

  ngOnInit(): void {
    this.searchControl.valueChanges.subscribe((v) => this.search.set(v));
    this.reload();
  }

  reload(): void {
    this.api.list().subscribe({
      next: (list) => this.surveys.set(list),
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
    });
  }

  statusLabel(status: SurveyStatus): string {
    return this.statusLabels[status];
  }

  openCreate(): void {
    const ref = this.dialog.open(SurveyFormDialogComponent, {
      ...FORM_DIALOG,
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

  remove(row: Survey): void {
    openConfirmDialog(this.dialog, {
      title: 'ลบแบบประเมิน',
      message: `ต้องการลบ「${row.title}」หรือไม่?`,
      confirmLabel: 'ลบแบบประเมิน',
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.api.remove(row.id).subscribe({
        next: () => {
          this.snack.open('ลบแบบประเมินแล้ว', 'ปิด', { duration: 2500 });
          this.reload();
        },
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 4000 }),
      });
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
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.group({
    title: ['', Validators.required],
    description: [''],
    questions: this.fb.array([this.newQuestion('ความพึงพอใจโดยรวม', 'RATING')]),
  });

  get questions(): FormArray {
    return this.form.get('questions') as FormArray;
  }

  newQuestion(text = '', type: QuestionType = 'RATING') {
    return this.fb.group({
      questionText: [text, Validators.required],
      questionType: [type as QuestionType],
      isRequired: [true],
      optionsText: [''],
    });
  }

  needsOptions(type: QuestionType | null | undefined): boolean {
    return type === 'CHOICE' || type === 'MULTI_CHOICE';
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
    const questions = (raw.questions ?? []).map((q) => {
      const questionType = (q?.questionType as QuestionType) ?? 'TEXT';
      const options = String(q?.optionsText ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      return {
        questionText: q?.questionText ?? '',
        questionType,
        isRequired: !!q?.isRequired,
        options: this.needsOptions(questionType) ? options : undefined,
      };
    });

    for (const q of questions) {
      if (this.needsOptions(q.questionType) && (!q.options || q.options.length === 0)) {
        this.error.set('คำถามแบบเลือกต้องมีตัวเลือกอย่างน้อย 1 รายการ');
        return;
      }
    }

    this.saving.set(true);
    this.error.set(null);
    this.api
      .create({
        title: raw.title ?? '',
        description: raw.description ?? '',
        questions,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.snack.open('สร้างแบบประเมินแล้ว (แบบร่าง)', 'ปิด', { duration: 2500 });
          this.ref.close(true);
        },
        error: (err: Error) => {
          this.saving.set(false);
          this.error.set(err.message);
        },
      });
  }
}
