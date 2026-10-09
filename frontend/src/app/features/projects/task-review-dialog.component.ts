import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TaskItem,
  TaskSubmission,
} from '../../core/models/project.model';
import { AuthService } from '../../core/services/auth.service';
import { ProjectService } from '../../core/services/project.service';
import { UserService } from '../../core/services/user.service';
import { downloadAuthorizedBlob } from '../../shared/utils/download-blob';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { HttpClient } from '@angular/common/http';
import {
  DOCUMENT_ACCEPT,
  DOCUMENT_MAX_BYTES,
  formatDocumentFileSize,
} from '../../core/models/document.model';
import { apiErrorMessage } from '../../core/http/api-error';
import { TaskSubmissionHistoryComponent } from './task-submission-history.component';

export interface TaskReviewDialogData {
  taskId: number;
  /** แถวจากรายการ — โชว์ระหว่างโหลด */
  seed?: TaskItem | null;
}

@Component({
  selector: 'app-task-review-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    ThaiDatePipe,
    TaskSubmissionHistoryComponent,
  ],
  templateUrl: './task-review-dialog.component.html',
  styleUrl: './task-review-dialog.component.scss',
})
export class TaskReviewDialogComponent implements OnInit {
  private readonly projectsApi = inject(ProjectService);
  private readonly usersApi = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly ref = inject(MatDialogRef<TaskReviewDialogComponent, boolean>);
  readonly data = inject<TaskReviewDialogData>(MAT_DIALOG_DATA);

  readonly statusLabels = TASK_STATUS_LABELS;
  readonly priorityLabels = TASK_PRIORITY_LABELS;

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly task = signal<TaskItem | null>(this.data.seed ?? null);
  readonly downloadingKey = signal<string | null>(null);

  readonly reviewNoteControl = this.fb.nonNullable.control('');
  readonly fileAccept = DOCUMENT_ACCEPT;
  /** ไฟล์ของผู้ตรวจ (ไม่บังคับ) — ส่งไปกับ PATCH /tasks/:id/review ได้ 1 ไฟล์ */
  readonly file = signal<File | null>(null);

  readonly canReview = computed(() => {
    this.auth.session();
    return this.auth.canAccessTaskReviewQueue();
  });

  readonly blockedSelfReview = computed(() => this.auth.blocksSelfReview(this.task()));

  /** ผู้ตรวจเห็นปุ่มอนุมัติ/ส่งกลับ — USER ห้ามอนุมัติงานตัวเอง (ADMIN ขึ้นไปได้) */
  readonly canDecide = computed(
    () => this.canReview() && !this.blockedSelfReview() && this.task()?.status === 'REVIEW'
  );

  /** รายงาน PENDING ล่าสุด — ใช้ตรวจงาน */
  readonly pendingSubmission = computed(() => {
    const rows = [...(this.task()?.submissions ?? [])].filter(
      (s) => (s.status ?? '').toUpperCase() === 'PENDING'
    );
    if (!rows.length) {
      return null;
    }
    rows.sort((a, b) => {
      const ta = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
      const tb = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
      return tb - ta;
    });
    return rows[0];
  });

  readonly hasPreviousRounds = computed(() =>
    (this.task()?.submissions ?? []).some((s) => (s.status ?? '').toUpperCase() !== 'PENDING')
  );

  ngOnInit(): void {
    this.usersApi.loadForPicker(null, { capability: 'TASK_REVIEW' }).subscribe({
      error: () => undefined,
    });
    this.loadTask();
  }

  private loadTask(): void {
    this.loading.set(true);
    this.error.set(null);
    this.projectsApi.getTask(this.data.taskId).subscribe({
      next: (task) => {
        this.task.set(task);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.loading.set(false);
        if (!this.task()) {
          this.error.set(err.message || 'โหลดรายละเอียดงานไม่สำเร็จ');
        } else {
          this.snack.open(err.message || 'โหลดรายละเอียดงานไม่สำเร็จ', 'ปิด', {
            duration: 4000,
          });
        }
      },
    });
  }

  projectLabel(task: TaskItem): string {
    if (task.project) {
      return `${task.project.code ? task.project.code + ' · ' : ''}${task.project.name}`;
    }
    return `#${task.projectId}`;
  }

  assigneeLabel(task: TaskItem): string {
    if (task.assignedUser?.fullName) {
      return task.assignedUser.fullName;
    }
    if (task.assignedUserId) {
      return this.usersApi.getById(task.assignedUserId)?.fullName ?? '—';
    }
    return 'ยังไม่มอบหมาย';
  }

  assignerLabel(task: TaskItem): string {
    if (task.assignedBy?.fullName) {
      return task.assignedBy.fullName;
    }
    if (task.assignedByUserId) {
      return this.usersApi.getById(task.assignedByUserId)?.fullName ?? '—';
    }
    return 'ไม่ระบุ';
  }

  hoursLabel(value: number | null | undefined): string {
    if (value == null) {
      return '—';
    }
    return `${value} ชม.`;
  }

  approve(): void {
    if (!this.canDecide()) {
      this.error.set('ไม่มีสิทธิ์อนุมัติงานนี้');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const file = this.file();
    this.projectsApi
      .reviewTask(this.data.taskId, 'DONE', this.reviewNoteControl.value, file)
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.snack.open('อนุมัติแล้ว — งานเสร็จสมบูรณ์', 'ปิด', { duration: 2500 });
          this.ref.close(true);
        },
        error: (err: Error) => {
          this.saving.set(false);
          this.error.set(err.message);
        },
      });
  }

  sendBack(): void {
    if (!this.canDecide()) {
      this.error.set('ไม่มีสิทธิ์ส่งกลับงานนี้');
      return;
    }
    const note = this.reviewNoteControl.value.trim();
    if (!note) {
      this.error.set('กรุณาระบุว่าต้องแก้อะไร ตรงไหน ก่อนส่งกลับ');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const file = this.file();
    this.projectsApi.reviewTask(this.data.taskId, 'DOING', note, file).subscribe({
      next: () => {
        this.saving.set(false);
        this.snack.open(
          file
            ? `ส่งกลับแก้ไขแล้ว พร้อมไฟล์ ${file.name}`
            : 'ส่งกลับแก้ไขแล้ว — งานกลับไปที่ผู้รับผิดชอบ',
          'ปิด',
          { duration: 3500 }
        );
        this.ref.close(true);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.error.set(apiErrorMessage(err));
      },
    });
  }

  onFilePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = input.files?.[0] ?? null;
    input.value = '';
    if (!picked) {
      return;
    }
    if (picked.size > DOCUMENT_MAX_BYTES) {
      this.snack.open(`ไฟล์ใหญ่เกิน 20 MB: ${picked.name}`, 'ปิด', { duration: 4500 });
      return;
    }
    this.file.set(picked);
  }

  removeFile(): void {
    this.file.set(null);
  }

  fileSize(bytes: number): string {
    return formatDocumentFileSize(bytes);
  }

  downloadSubmissionUrl(url: string, fileName: string, key: string): void {
    if (!url) {
      this.snack.open('ไม่มีลิงก์ดาวน์โหลดรายงาน', 'ปิด', { duration: 3000 });
      return;
    }
    this.downloadingKey.set(key);
    downloadAuthorizedBlob(this.http, url, fileName || 'download').subscribe({
      next: () => this.downloadingKey.set(null),
      error: (err: Error) => {
        this.downloadingKey.set(null);
        this.snack.open(err.message || 'ดาวน์โหลดไฟล์ไม่สำเร็จ', 'ปิด', { duration: 4000 });
      },
    });
  }

  trackSubmission(index: number, s: TaskSubmission): number | string {
    return s.id ?? `${s.submittedAt ?? 'sub'}-${index}`;
  }

  dismiss(): void {
    this.ref.close(false);
  }
}
