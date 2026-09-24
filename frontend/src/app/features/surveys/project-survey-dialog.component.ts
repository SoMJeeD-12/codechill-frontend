import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  QUESTION_TYPE_LABELS,
  QuestionType,
  Survey,
  SurveyAnswerInput,
  SurveyAssignment,
  SurveyQuestion,
} from '../../core/models/survey.model';
import { Contact } from '../../core/models/customer.model';
import { SurveyService } from '../../core/services/survey.service';

export type ProjectSurveyDialogData = {
  projectId: number;
  customerId: number;
  contacts: Contact[];
  /** โหมดตอบอย่างเดียว — มี assignment + survey พร้อมแล้ว */
  assignment?: SurveyAssignment;
  survey?: Survey;
};

@Component({
  selector: 'app-project-survey-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatRadioModule,
    MatCheckboxModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './project-survey-dialog.component.html',
  styleUrl: './project-survey-dialog.component.scss',
})
export class ProjectSurveyDialogComponent implements OnInit {
  private readonly api = inject(SurveyService);
  private readonly fb = inject(FormBuilder);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject(MatDialogRef<ProjectSurveyDialogComponent, boolean>);
  readonly data = inject<ProjectSurveyDialogData>(MAT_DIALOG_DATA);

  readonly typeLabels = QUESTION_TYPE_LABELS;
  readonly step = signal<'pick' | 'answer'>(this.data.assignment && this.data.survey ? 'answer' : 'pick');
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly usableSurveys = signal<Survey[]>([]);
  readonly activeSurvey = signal<Survey | null>(this.data.survey ?? null);
  readonly assignment = signal<SurveyAssignment | null>(this.data.assignment ?? null);

  readonly pickForm = this.fb.group({
    surveyId: [null as number | null, Validators.required],
    contactId: [null as number | null],
  });

  readonly commentControl = this.fb.nonNullable.control('');
  answerControls: Record<number, FormControl<string | number | string[] | null>> = {};

  ngOnInit(): void {
    if (this.step() === 'answer') {
      this.prepareAnswerForm();
      return;
    }
    this.loading.set(true);
    this.api.list({ limit: 100 }).subscribe({
      next: (rows) => {
        const usable = rows.filter((s) => s.isCurrentlyUsable);
        this.usableSurveys.set(usable);
        const first = usable[0];
        if (first) {
          this.pickForm.patchValue({ surveyId: first.id });
        }
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.snack.open(err.message || 'โหลดแบบประเมินไม่สำเร็จ', 'ปิด', { duration: 4000 });
      },
    });
  }

  /** โหลดคำถามจาก GET เสมอ — list อาจไม่มี questions ครบ */
  private prepareAnswerForm(): void {
    const assignment = this.assignment();
    const surveyId = this.activeSurvey()?.id ?? assignment?.surveyId;
    if (!surveyId) {
      this.snack.open('ไม่พบแบบประเมินสำหรับตอบ', 'ปิด', { duration: 3500 });
      return;
    }
    const existing = this.activeSurvey();
    if (existing?.questions?.length) {
      this.buildAnswerControls(existing.questions);
      return;
    }
    this.loading.set(true);
    this.api.get(surveyId).subscribe({
      next: (survey) => {
        this.activeSurvey.set(survey);
        this.buildAnswerControls(survey.questions);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.snack.open(err.message || 'โหลดคำถามไม่สำเร็จ', 'ปิด', { duration: 4000 });
      },
    });
  }

  typeLabel(type: QuestionType): string {
    return this.typeLabels[type];
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

  startSend(): void {
    if (this.pickForm.invalid) {
      this.pickForm.markAllAsTouched();
      return;
    }
    const surveyId = Number(this.pickForm.getRawValue().surveyId);
    const contactId = this.pickForm.getRawValue().contactId;
    this.saving.set(true);
    this.api
      .createAssignment(surveyId, {
        customerId: this.data.customerId,
        projectId: this.data.projectId,
        contactId: contactId || null,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.snack.open('บันทึกการส่งแล้ว — กด「บันทึกคำตอบ」ในแถวเมื่อพร้อมคีย์', 'ปิด', {
            duration: 3500,
          });
          this.ref.close(true);
        },
        error: (err: Error) => {
          this.saving.set(false);
          this.snack.open(err.message, 'ปิด', { duration: 4000 });
        },
      });
  }

  submitAnswers(): void {
    const survey = this.activeSurvey();
    const assignment = this.assignment();
    if (!survey?.questions?.length || !assignment) {
      this.snack.open('ยังโหลดคำถามไม่ครบ — ลองเปิดใหม่', 'ปิด', { duration: 3500 });
      return;
    }
    for (const q of survey.questions) {
      const ctrl = this.answerControls[q.id];
      if (!ctrl) {
        this.snack.open('ฟอร์มคำตอบไม่พร้อม — ลองเปิดใหม่', 'ปิด', { duration: 3500 });
        return;
      }
      if (q.isRequired && (ctrl.invalid || this.isEmptyAnswer(q, ctrl.value))) {
        ctrl.markAsTouched();
        this.snack.open('กรุณากรอกคำตอบที่จำเป็นให้ครบ', 'ปิด', { duration: 3000 });
        return;
      }
    }

    const answers: SurveyAnswerInput[] = survey.questions.map((q) => {
      const raw = this.answerControls[q.id].value;
      const questionId = Number(q.id);
      if (q.questionType === 'RATING') {
        return {
          questionId,
          answerNumber: raw == null || raw === '' ? null : Number(raw),
        };
      }
      if (q.questionType === 'CHOICE') {
        return {
          questionId,
          answerText: raw ? String(raw) : '',
        };
      }
      if (q.questionType === 'MULTI_CHOICE') {
        return {
          questionId,
          answerChoices: Array.isArray(raw) ? raw : [],
        };
      }
      return {
        questionId,
        answerText: String(raw ?? ''),
      };
    });

    this.saving.set(true);
    this.api
      .submitAssignmentResponse(assignment.id, {
        answers,
        comment: this.commentControl.value.trim() || null,
      })
      .subscribe({
        next: (row) => {
          this.saving.set(false);
          if (!row?.id) {
            this.snack.open('เซิร์ฟเวอร์ไม่ยืนยันการบันทึก — ลองอีกครั้ง', 'ปิด', {
              duration: 4000,
            });
            return;
          }
          this.snack.open('บันทึกคำตอบแล้ว', 'ปิด', { duration: 2500 });
          this.ref.close(true);
        },
        error: (err: Error) => {
          this.saving.set(false);
          this.snack.open(err.message || 'บันทึกคำตอบไม่สำเร็จ', 'ปิด', { duration: 4500 });
        },
      });
  }

  close(): void {
    this.ref.close(false);
  }

  private buildAnswerControls(questions: SurveyQuestion[]): void {
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
