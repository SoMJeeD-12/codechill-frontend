import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TaskItem } from '../../core/models/project.model';
import { ProjectService } from '../../core/services/project.service';

export interface TaskSubmitReportDialogData {
  task: TaskItem;
}

/**
 * ผู้รับผิดชอบส่งรายงาน + ส่งตรวจ
 * ลำดับบังคับ:
 *   POST /tasks/:id/submissions (multipart)
 *   → สำเร็จแล้วค่อย PATCH /tasks/:id/submit-review
 * ห้ามเรียก submit-review ก่อน / ห้ามเรียก PATCH /review
 */
@Component({
  selector: 'app-task-submit-report-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>ส่งตรวจ — รายงานผลการทำงาน</h2>
    <mat-dialog-content>
      <p class="task-ref">
        งาน #{{ data.task.id }} · {{ data.task.title }}
      </p>
      <p class="hint">
        ระบบจะส่งรายงานก่อน (POST /submissions) แล้วค่อยส่งตรวจ (PATCH /submit-review)
      </p>
      <form [formGroup]="form" class="form" id="submit-report-form" (ngSubmit)="submit()">
        <mat-form-field appearance="outline" class="full">
          <mat-label>รายงานผลการทำงาน *</mat-label>
          <textarea
            matInput
            rows="6"
            formControlName="report"
            placeholder="สรุปสิ่งที่ทำเสร็จ / ผลลัพธ์ / จุดที่ต้องตรวจ…"
          ></textarea>
          @if (form.controls.report.touched && form.controls.report.invalid) {
            <span class="field-error">กรุณากรอกรายงาน</span>
          }
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>ชั่วโมงที่ใช้จริง (ไม่บังคับ)</mat-label>
          <input matInput type="number" min="0" step="0.5" formControlName="actualHours" />
        </mat-form-field>
        <div class="file-field">
          <label class="file-label">แนบไฟล์รายงาน (ไม่บังคับ)</label>
          <input type="file" (change)="onFileSelected($event)" />
          @if (fileName()) {
            <p class="file-name">
              <mat-icon>attach_file</mat-icon>
              {{ fileName() }}
              <button mat-button type="button" (click)="clearFile()">ลบไฟล์</button>
            </p>
          }
        </div>
      </form>
      @if (error()) {
        <p class="error">{{ error() }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close(false)" [disabled]="saving()">ยกเลิก</button>
      <button
        mat-flat-button
        color="primary"
        type="submit"
        form="submit-report-form"
        [disabled]="saving()"
      >
        {{ saving() ? 'กำลังส่ง…' : 'ส่งตรวจ' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .task-ref {
      margin: 0 0 0.35rem;
      color: #5b6762;
      font-size: 0.9rem;
    }
    .hint {
      margin: 0 0 0.85rem;
      color: #64748b;
      font-size: 0.82rem;
    }
    .form {
      display: grid;
      gap: 0.25rem;
      min-width: min(560px, 86vw);
    }
    .full {
      width: 100%;
    }
    .file-field {
      display: grid;
      gap: 0.35rem;
      margin: 0.35rem 0 0.5rem;
    }
    .file-label {
      font-size: 0.82rem;
      color: #64748b;
      font-weight: 600;
    }
    .file-name {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      margin: 0;
      font-size: 0.9rem;
      mat-icon {
        font-size: 1.1rem;
        width: 1.1rem;
        height: 1.1rem;
      }
    }
    .error {
      margin: 0.5rem 0 0;
      color: #991b1b;
    }
    .field-error {
      color: #991b1b;
      font-size: 0.78rem;
      margin-top: -0.35rem;
    }
  `,
})
export class TaskSubmitReportDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly projectsApi = inject(ProjectService);
  private readonly snack = inject(MatSnackBar);
  readonly ref = inject(MatDialogRef<TaskSubmitReportDialogComponent, boolean>);
  readonly data = inject<TaskSubmitReportDialogData>(MAT_DIALOG_DATA);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly fileName = signal<string | null>(null);
  private selectedFile: File | null = null;

  readonly form = this.fb.group({
    report: ['', Validators.required],
    actualHours: [null as number | null],
  });

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.selectedFile = file;
    this.fileName.set(file?.name ?? null);
  }

  clearFile(): void {
    this.selectedFile = null;
    this.fileName.set(null);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('กรุณากรอกรายงานผลการทำงาน');
      return;
    }
    const report = (this.form.controls.report.value ?? '').trim();
    if (!report) {
      this.error.set('กรุณากรอกรายงานผลการทำงาน');
      return;
    }
    const taskId = this.data.task.id;
    if (!taskId) {
      this.error.set('ไม่พบรหัสงาน');
      return;
    }

    this.saving.set(true);
    this.error.set(null);

    // ลำดับ: POST submissions → (สำเร็จ) PATCH submit-review — ใช้ task.id เดียวกัน
    this.projectsApi
      .submitTaskWithReport(taskId, {
        report,
        actualHours: this.form.controls.actualHours.value,
        file: this.selectedFile,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.snack.open('ส่งตรวจแล้ว — สถานะรอตรวจ', 'ปิด', { duration: 3000 });
          this.ref.close(true);
        },
        error: (err: Error) => {
          this.saving.set(false);
          // แสดง error จาก POST (หรือ PATCH ถ้า POST ผ่านแล้ว) — ไม่ปิด modal
          this.error.set(err.message || 'ส่งตรวจไม่สำเร็จ');
        },
      });
  }
}
