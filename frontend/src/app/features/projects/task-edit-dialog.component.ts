import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TaskItem,
  TaskPriority,
  TaskStatus,
} from '../../core/models/project.model';
import { ApiProjectDocument } from '../../core/models/document.model';
import { AuthService } from '../../core/services/auth.service';
import { DocumentService } from '../../core/services/document.service';
import { ProjectService, TaskInput } from '../../core/services/project.service';
import { UserService } from '../../core/services/user.service';
import { parseDateOnly, toDateOnlyString } from '../../core/utils/date.util';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { FORM_DIALOG_COMPACT } from '../../shared/utils/form-dialog';
import { TaskSubmitReportDialogComponent } from './task-submit-report-dialog.component';

export interface TaskDialogData {
  projectId: number;
  task: TaskItem | null;
  /** ใช้ตอนสร้างงานย่อยใต้งานอื่น */
  parentTaskId?: number | null;
  /** มีแค่ task.view — ดูอย่างเดียว */
  readOnly?: boolean;
  /** ผู้รับผิดชอบ vs ผู้ตรวจ — กำหนดปุ่มสถานะ */
  workflow?: 'assignee' | 'reviewer';
}

@Component({
  selector: 'app-task-edit-dialog',
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
    MatDatepickerModule,
    ThaiDatePipe,
  ],
  templateUrl: './task-edit-dialog.component.html',
  styleUrl: './task-edit-dialog.component.scss',
})
export class TaskEditDialogComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly projectsApi = inject(ProjectService);
  private readonly docsApi = inject(DocumentService);
  private readonly usersApi = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly ref = inject(MatDialogRef<TaskEditDialogComponent, boolean>);
  readonly data = inject<TaskDialogData>(MAT_DIALOG_DATA);

  readonly isEdit = !!this.data.task;
  readonly users = this.usersApi.assignableTask;
  readonly taskStatuses = TASK_STATUSES;
  readonly taskStatusLabels = TASK_STATUS_LABELS;
  readonly priorityLabels = TASK_PRIORITY_LABELS;
  readonly priorities = TASK_PRIORITIES;
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly currentTask = signal<TaskItem | null>(this.data.task);
  readonly status = signal<TaskStatus>(this.data.task?.status ?? 'TODO');
  readonly projectDocs = signal<ApiProjectDocument[]>([]);
  readonly docsLoading = signal(false);
  readonly downloadingId = signal<number | null>(null);
  /** โหมดดูรายละเอียดแบบการ์ด (ค่าเริ่มต้นเมื่อเปิดงานที่มีอยู่) */
  readonly editing = signal(false);
  private statusChanged = false;

  readonly canUpdate = computed(() => {
    this.auth.session();
    if (this.data.readOnly) {
      return false;
    }
    return this.auth.hasPermissionCode('task.update');
  });

  readonly canReview = computed(() => {
    this.auth.session();
    return this.auth.canAccessTaskReviewQueue();
  });

  readonly workflow = computed<'assignee' | 'reviewer'>(() => {
    if (this.data.workflow) {
      return this.data.workflow;
    }
    const task = this.currentTask();
    if (task?.status === 'REVIEW' && this.canReview() && !this.isOwnAssignment(task)) {
      return 'reviewer';
    }
    return 'assignee';
  });

  readonly form = this.fb.group({
    title: [this.data.task?.title ?? '', Validators.required],
    description: [this.data.task?.description ?? ''],
    status: [(this.data.task?.status ?? 'TODO') as TaskStatus, Validators.required],
    priority: [(this.data.task?.priority ?? 'NORMAL') as TaskPriority, Validators.required],
    assignedUserId: [this.data.task?.assignedUserId ?? (null as number | null)],
    startDate: [parseDateOnly(this.data.task?.startDate) as Date | null],
    dueDate: [parseDateOnly(this.data.task?.dueDate) as Date | null],
    actualHours: [this.data.task?.actualHours ?? (null as number | null)],
  });

  constructor() {
    // GET /users/assignable?capability=TASK — ไม่กรอง Role ฝั่ง FE
    this.usersApi.loadForPicker(null, { capability: 'TASK' }).subscribe({
      error: () => undefined,
    });
    this.form.controls.status.valueChanges.subscribe((value) => {
      if (value) {
        this.status.set(value);
      }
    });
    if (!this.canUpdate()) {
      this.form.disable({ emitEvent: false });
    } else if (this.data.workflow === 'assignee' || this.data.workflow === 'reviewer' || !this.data.workflow) {
      // เปลี่ยนสถานะผ่านปุ่ม workflow เท่านั้น
      this.form.controls.status.disable({ emitEvent: false });
    }
  }

  ngOnInit(): void {
    if (this.isEdit && this.data.projectId) {
      this.loadProjectDocuments();
    }
  }

  private loadProjectDocuments(): void {
    this.docsLoading.set(true);
    this.docsApi.listByProject(this.data.projectId, { limit: 50 }).subscribe({
      next: (page) => {
        this.projectDocs.set(page.items);
        this.docsLoading.set(false);
      },
      error: () => {
        this.projectDocs.set([]);
        this.docsLoading.set(false);
      },
    });
  }

  startEditing(): void {
    if (!this.canUpdate()) {
      return;
    }
    this.editing.set(true);
  }

  cancelEditing(): void {
    const task = this.currentTask();
    if (task) {
      this.form.reset(
        {
          title: task.title,
          description: task.description ?? '',
          status: task.status,
          priority: task.priority,
          assignedUserId: task.assignedUserId,
          startDate: parseDateOnly(task.startDate),
          dueDate: parseDateOnly(task.dueDate),
          actualHours: task.actualHours,
        },
        { emitEvent: false }
      );
      this.status.set(task.status);
    }
    this.editing.set(false);
    this.error.set(null);
  }

  isOwnAssignment(task: TaskItem | null = this.currentTask()): boolean {
    if (!task) {
      return false;
    }
    const uid = this.auth.currentUser()?.id;
    return uid != null && task.assignedUserId === uid;
  }

  projectLabel(task: TaskItem): string {
    if (task.project) {
      return `${task.project.code ? task.project.code + ' · ' : ''}${task.project.name}`;
    }
    return `#${task.projectId}`;
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

  assigneeLabel(task: TaskItem): string {
    if (task.assignedUser?.fullName) {
      return task.assignedUser.fullName;
    }
    if (task.assignedUserId) {
      return this.usersApi.getById(task.assignedUserId)?.fullName ?? `#${task.assignedUserId}`;
    }
    return 'ยังไม่มอบหมาย';
  }

  statusActions(): { label: string; status: TaskStatus; kind: 'status' | 'submit' | 'review' }[] {
    if (!this.canUpdate() || !this.currentTask()) {
      return [];
    }
    const st = this.status();
    if (this.workflow() === 'reviewer') {
      // ผู้ตรวจ — ไม่มีส่งตรวจ · ห้ามอนุมัติงานตัวเอง
      if (st !== 'REVIEW' || !this.canReview() || this.isOwnAssignment()) {
        return [];
      }
      return [
        { label: 'อนุมัติ/ทำเสร็จ', status: 'DONE', kind: 'review' },
        { label: 'ส่งกลับแก้ไข', status: 'DOING', kind: 'review' },
      ];
    }

    // ผู้รับผิดชอบ — ส่งตรวจได้ ห้ามทำเสร็จเอง
    const actions: { label: string; status: TaskStatus; kind: 'status' | 'submit' | 'review' }[] = [];
    switch (st) {
      case 'TODO':
        actions.push({ label: 'เริ่มงาน', status: 'DOING', kind: 'status' });
        break;
      case 'DOING':
        actions.push({ label: 'พักงาน', status: 'WAITING', kind: 'status' });
        break;
      case 'WAITING':
        actions.push({ label: 'กลับมาทำ', status: 'DOING', kind: 'status' });
        break;
      default:
        break;
    }
    if (st !== 'REVIEW' && st !== 'DONE') {
      actions.push({ label: 'ส่งตรวจ', status: 'REVIEW', kind: 'submit' });
    }
    return actions;
  }

  changeStatus(next: TaskStatus, kind: 'status' | 'submit' | 'review' = 'status'): void {
    const task = this.currentTask();
    if (!task || !this.canUpdate()) {
      return;
    }
    if (kind === 'submit') {
      this.openSubmitReport(task);
      return;
    }
    if (kind === 'review') {
      this.error.set('กรุณาตรวจงานจากหน้า「งานรอตรวจ」');
      return;
    }
    if (this.workflow() === 'assignee' && next === 'DONE') {
      this.error.set('ผู้รับผิดชอบส่งตรวจได้เท่านั้น — รอผู้ตรวจอนุมัติ');
      return;
    }
    if (task.status === next) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);

    this.projectsApi.updateTaskStatus(task.id, next).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.statusChanged = true;
        this.currentTask.set(updated);
        this.status.set(updated.status);
        this.form.patchValue(
          {
            status: updated.status,
            actualHours: updated.actualHours,
          },
          { emitEvent: false }
        );
        this.snack.open(`เปลี่ยนสถานะเป็น「${this.taskStatusLabels[updated.status]}」แล้ว`, 'ปิด', {
          duration: 2500,
        });
      },
      error: (err: Error) => {
        this.saving.set(false);
        this.error.set(err.message);
      },
    });
  }

  private openSubmitReport(task: TaskItem): void {
    const ref = this.dialog.open(TaskSubmitReportDialogComponent, {
      ...FORM_DIALOG_COMPACT,
      data: { task },
    });
    ref.afterClosed().subscribe((ok) => {
      if (ok) {
        this.statusChanged = true;
        this.ref.close(true);
      }
    });
  }

  downloadDoc(doc: ApiProjectDocument): void {
    this.downloadingId.set(doc.id);
    this.docsApi.download(doc).subscribe({
      next: () => this.downloadingId.set(null),
      error: (err: Error) => {
        this.downloadingId.set(null);
        this.snack.open(err.message || 'ดาวน์โหลดเอกสารไม่สำเร็จ', 'ปิด', { duration: 4000 });
      },
    });
  }

  dismiss(): void {
    this.ref.close(this.statusChanged);
  }

  save(): void {
    if (!this.canUpdate()) {
      this.ref.close(this.statusChanged);
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const taskStatus = raw.status as TaskStatus;
    const assignedUserId = raw.assignedUserId;
    const payload: TaskInput = {
      title: (raw.title ?? '').trim(),
      description: (raw.description ?? '').trim(),
      status: taskStatus,
      priority: raw.priority as TaskPriority,
      assignedUserId,
      startDate: toDateOnlyString(raw.startDate) || null,
      dueDate: toDateOnlyString(raw.dueDate) || null,
      parentTaskId: this.data.task?.parentTaskId ?? this.data.parentTaskId ?? null,
    };
    if (taskStatus === 'DONE' && raw.actualHours != null) {
      payload.actualHours = String(raw.actualHours);
    }
    this.saving.set(true);
    this.error.set(null);

    const req = this.isEdit
      ? this.projectsApi.updateTask(this.data.projectId, this.data.task!.id, payload)
      : this.projectsApi.createTask(this.data.projectId, payload);

    req.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.currentTask.set(saved);
        const assigneeName =
          saved.assignedUser?.fullName ||
          (assignedUserId != null
            ? this.usersApi.getById(assignedUserId)?.fullName
            : null);
        if (assignedUserId != null && assigneeName) {
          this.snack.open(`มอบหมายงานให้ ${assigneeName} แล้ว`, 'ปิด', { duration: 3000 });
        } else {
          this.snack.open(this.isEdit ? 'แก้ไขงานย่อยแล้ว' : 'เพิ่มงานย่อยแล้ว', 'ปิด', {
            duration: 2500,
          });
        }
        this.ref.close(true);
      },
      error: (err: Error) => {
        this.saving.set(false);
        this.error.set(err.message);
      },
    });
  }
}
