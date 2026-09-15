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

  readonly reviewNoteControl = this.fb.nonNullable.control('กรุณาแก้ไขรายละเอียดเพิ่มเติม');

  readonly canReview = computed(() => {
    this.auth.session();
    return this.auth.canAccessTaskReviewQueue();
  });

  readonly isOwnAssignment = computed(() => {
    const t = this.task();
    const uid = this.auth.currentUser()?.id;
    return !!(t && uid != null && t.assignedUserId === uid);
  });

  /** ผู้ตรวจเห็นปุ่มอนุมัติ/ส่งกลับ — ห้ามอนุมัติงานตัวเอง */
  readonly canDecide = computed(
    () => this.canReview() && !this.isOwnAssignment() && this.task()?.status === 'REVIEW'
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
      return this.usersApi.getById(task.assignedUserId)?.fullName ?? `#${task.assignedUserId}`;
    }
    return 'ยังไม่มอบหมาย';
  }

  assignerLabel(task: TaskItem): string {
    if (task.assignedBy?.fullName) {
      return task.assignedBy.fullName;
    }
    if (task.assignedByUserId) {
      return this.usersApi.getById(task.assignedByUserId)?.fullName ?? `#${task.assignedByUserId}`;
    }
    return '—';
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
    this.projectsApi.reviewTask(this.data.taskId, 'DONE').subscribe({
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
      this.error.set('กรุณาระบุหมายเหตุเมื่อส่งกลับแก้ไข');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.projectsApi.reviewTask(this.data.taskId, 'DOING', note).subscribe({
      next: () => {
        this.saving.set(false);
        this.snack.open('ส่งกลับแก้ไขแล้ว — งานกลับไปที่ผู้รับผิดชอบ', 'ปิด', {
          duration: 3000,
        });
        this.ref.close(true);
      },
      error: (err: Error) => {
        this.saving.set(false);
        this.error.set(err.message);
      },
    });
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
