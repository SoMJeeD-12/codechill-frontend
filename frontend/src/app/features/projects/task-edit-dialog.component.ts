import { HttpClient } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
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
import { Router } from '@angular/router';
import { debounceTime, distinctUntilChanged, map } from 'rxjs/operators';
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TaskItem,
  TaskPriority,
  TaskStatus,
  TaskSubmission,
} from '../../core/models/project.model';
import { ApiProjectDocument } from '../../core/models/document.model';
import { AuthService } from '../../core/services/auth.service';
import { NotificationInboxService } from '../../core/services/notification-inbox.service';
import { DocumentService } from '../../core/services/document.service';
import { ProjectService, TaskInput } from '../../core/services/project.service';
import { UserService } from '../../core/services/user.service';
import { parseDateOnly, toDateOnlyString } from '../../core/utils/date.util';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { PICKER_DEBOUNCE_MS, PICKER_MIN_CHARS } from '../../shared/components/entity-picker.component';
import { downloadAuthorizedBlob, downloadAuthorizedBlobAs } from '../../shared/utils/download-blob';
import { FORM_DIALOG_COMPACT } from '../../shared/utils/form-dialog';
import { TaskSubmitReportDialogComponent } from './task-submit-report-dialog.component';

/** วันครบกำหนดต้องไม่ก่อนวันเริ่มงาน */
const dueNotBeforeStartValidator: ValidatorFn = (
  control: AbstractControl
): ValidationErrors | null => {
  const due = control.value as Date | null | undefined;
  const start = control.parent?.get('startDate')?.value as Date | null | undefined;
  if (!start || !due) {
    return null;
  }
  const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const dueDay = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
  return dueDay < startDay ? { dueBeforeStart: true } : null;
};

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
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  /** โชว์ช่องค้นหาเมื่อรายการเริ่มยาวเกินที่เห็นในกรอบเลื่อน */
  private readonly projectDocsSearchMin = 2;
  private docsRequest = 0;
  private readonly fb = inject(FormBuilder);
  private readonly projectsApi = inject(ProjectService);
  private readonly docsApi = inject(DocumentService);
  private readonly usersApi = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly notificationInbox = inject(NotificationInboxService);
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
  /** จำนวนเอกสารทั้งโปรเจกต์ตอนยังไม่ค้น — ใช้ตัดสินใจโชว์ช่องค้นหา */
  readonly projectDocsCatalogTotal = signal(0);
  readonly projectDocSearchControl = this.fb.nonNullable.control('');
  readonly submissionSearchControl = this.fb.nonNullable.control('');
  readonly submissionSearch = signal('');
  /** คำค้นที่ใช้กับรายการปัจจุบัน — ไม่ผูกกับไฟล์ที่ส่งในงาน */
  readonly appliedProjectDocSearch = signal('');
  readonly docsLoading = signal(false);
  readonly downloadingId = signal<number | null>(null);
  readonly downloadingKey = signal<string | null>(null);
  readonly submissionsLoading = signal(
    this.isEdit && !(this.data.task?.submissions?.length)
  );
  /** คลังเอกสารโปรเจกต์ — ค่าเริ่มต้นหุบ เพื่อไม่ปนกับไฟล์ของงาน */
  readonly projectDocsOpen = signal(false);
  readonly showProjectDocSearch = computed(
    () =>
      Math.max(this.projectDocsCatalogTotal(), this.projectDocs().length) >
      this.projectDocsSearchMin
  );
  /** จำนวนแถวในตารางไฟล์ของงาน — โชว์ค้นหาเมื่อเยอะกว่าเกณฑ์เดียวกับเอกสารโปรเจกต์ */
  readonly submissionRowCount = computed(() =>
    this.taskSubmissions().reduce((count, sub) => count + Math.max(sub.files.length, 1), 0)
  );
  readonly showSubmissionSearch = computed(
    () => this.submissionRowCount() > this.projectDocsSearchMin
  );
  readonly filteredTaskSubmissions = computed(() => {
    const q = this.submissionSearch().trim().toLowerCase();
    const rows = this.taskSubmissions();
    if (q.length < PICKER_MIN_CHARS) {
      return rows;
    }
    return rows
      .map((sub) => {
        const report = (sub.report ?? '').toLowerCase();
        const status = this.submissionStatusLabel(sub.status).toLowerCase();
        const files = sub.files.filter((file) => file.fileName.toLowerCase().includes(q));
        if (report.includes(q) || status.includes(q)) {
          return sub;
        }
        if (!files.length) {
          return null;
        }
        return { ...sub, files };
      })
      .filter((sub): sub is TaskSubmission => !!sub);
  });
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

  /** ระบุ/เปลี่ยนผู้รับผิดชอบต้องมี task.assign — ไม่มีแล้วส่งไป BE จะได้ 403 */
  readonly canAssign = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('task.assign');
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
    dueDate: [
      parseDateOnly(this.data.task?.dueDate) as Date | null,
      dueNotBeforeStartValidator,
    ],
    actualHours: [this.data.task?.actualHours ?? (null as number | null)],
  });

  constructor() {
    // GET /users/assignable?capability=TASK — ไม่กรอง Role ฝั่ง FE
    this.usersApi.loadForPicker(this.auth.currentUser(), { capability: 'TASK' }).subscribe({
      error: () => undefined,
    });
    this.form.controls.status.valueChanges.subscribe((value) => {
      if (value) {
        this.status.set(value);
      }
    });
    this.form.controls.startDate.valueChanges.subscribe(() => {
      this.form.controls.dueDate.updateValueAndValidity({ emitEvent: false });
    });
    if (!this.canUpdate()) {
      this.form.disable({ emitEvent: false });
    } else if (this.data.workflow === 'assignee' || this.data.workflow === 'reviewer' || !this.data.workflow) {
      // เปลี่ยนสถานะผ่านปุ่ม workflow เท่านั้น
      this.form.controls.status.disable({ emitEvent: false });
    }
    if (!this.canAssign()) {
      this.form.controls.assignedUserId.disable({ emitEvent: false });
    }
  }

  readonly taskSubmissions = computed(() => {
    const rows = this.currentTask()?.submissions ?? [];
    return [...rows].sort((a, b) => {
      const at = a.submittedAt ?? '';
      const bt = b.submittedAt ?? '';
      if (at !== bt) {
        return bt.localeCompare(at);
      }
      return (b.id ?? 0) - (a.id ?? 0);
    });
  });

  ngOnInit(): void {
    const task = this.data.task;
    if (this.isEdit && task) {
      this.notificationInbox.markReadByRef('TASK', task.id);
      this.projectsApi.getTask(task.id).subscribe({
        next: (fresh) => {
          this.currentTask.set({
            ...task,
            ...fresh,
            project: fresh.project ?? task.project ?? null,
            submissions: fresh.submissions ?? task.submissions ?? [],
          });
          this.submissionsLoading.set(false);
        },
        error: () => this.submissionsLoading.set(false),
      });
    }
    if (this.isEdit) {
      this.applyDetailWidth();
    }
    if (this.isEdit) {
      this.submissionSearchControl.valueChanges
        .pipe(
          debounceTime(PICKER_DEBOUNCE_MS),
          map((value) => value.trim()),
          distinctUntilChanged(),
          takeUntilDestroyed(this.destroyRef)
        )
        .subscribe((value) => this.submissionSearch.set(value));
    }
    if (this.isEdit && this.data.projectId) {
      this.projectDocSearchControl.valueChanges
        .pipe(
          debounceTime(PICKER_DEBOUNCE_MS),
          map((value) => value.trim()),
          distinctUntilChanged(),
          takeUntilDestroyed(this.destroyRef)
        )
        .subscribe((value) => this.loadProjectDocuments(value));
      this.loadProjectDocuments('');
    }
  }

  toggleProjectDocs(): void {
    this.projectDocsOpen.update((open) => !open);
  }

  submissionStatusLabel(status: string | null): string {
    switch (status) {
      case 'PENDING':
        return 'รอตรวจ';
      case 'APPROVED':
        return 'อนุมัติแล้ว';
      case 'REJECTED':
        return 'ส่งกลับแก้ไข';
      default:
        return status || '—';
    }
  }

  downloadSubmission(url: string, fileName: string, key: string): void {
    if (!url) {
      this.snack.open('ไม่มีลิงก์ดาวน์โหลดไฟล์ของงาน', 'ปิด', { duration: 3000 });
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

  downloadReviewFile(sub: TaskSubmission, key: string): void {
    if (!sub.reviewDownloadUrl) {
      return;
    }
    this.downloadingKey.set(key);
    downloadAuthorizedBlobAs(this.http, sub.reviewDownloadUrl, sub.reviewFileName || '').subscribe({
      next: () => this.downloadingKey.set(null),
      error: (err: Error) => {
        this.downloadingKey.set(null);
        this.snack.open(err.message || 'ดาวน์โหลดไฟล์ไม่สำเร็จ', 'ปิด', { duration: 4000 });
      },
    });
  }

  trackSubmission(index: number, row: TaskSubmission): number | string {
    return row.id ?? `${row.submittedAt ?? 'sub'}-${index}`;
  }

  submissionFileKey(row: TaskSubmission, submissionIndex: number, fileIndex: number): string {
    return `sub-${row.id ?? submissionIndex}-${fileIndex}`;
  }

  projectDocSearchActive(): boolean {
    return this.appliedProjectDocSearch().length >= PICKER_MIN_CHARS;
  }

  goToProjectDocuments(): void {
    const projectId = this.data.projectId;
    if (!projectId) {
      return;
    }
    const search = this.projectDocSearchControl.value.trim();
    this.ref.close(this.statusChanged);
    this.router.navigate(['/app/projects', projectId], {
      queryParams:
        search.length >= PICKER_MIN_CHARS
          ? { tab: 'documents', search }
          : { tab: 'documents' },
    });
  }

  private loadProjectDocuments(raw: string): void {
    const q = raw.trim();
    const search = q.length >= PICKER_MIN_CHARS ? q : undefined;
    const requestId = ++this.docsRequest;
    this.docsLoading.set(true);
    this.docsApi.listByProject(this.data.projectId, { search, limit: 50 }).subscribe({
      next: (page) => {
        if (requestId !== this.docsRequest) {
          return;
        }
        this.projectDocs.set(page.items);
        this.appliedProjectDocSearch.set(search ?? '');
        if (!search) {
          this.projectDocsCatalogTotal.set(page.total);
        }
        this.docsLoading.set(false);
      },
      error: () => {
        if (requestId !== this.docsRequest) {
          return;
        }
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
    this.ref.updateSize('760px');
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
    this.applyDetailWidth();
  }

  private applyDetailWidth(): void {
    this.ref.updateSize('1100px');
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
    return 'ไม่ระบุ';
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

    // ผู้รับผิดชอบ — ส่งตรวจได้หลังเริ่มงาน (DOING) เท่านั้น ห้ามทำเสร็จเอง
    const actions: { label: string; status: TaskStatus; kind: 'status' | 'submit' | 'review' }[] = [];
    switch (st) {
      case 'TODO':
        actions.push({ label: 'เริ่มงาน', status: 'DOING', kind: 'status' });
        break;
      case 'DOING':
        actions.push({ label: 'พักงาน', status: 'WAITING', kind: 'status' });
        actions.push({ label: 'ส่งตรวจ', status: 'REVIEW', kind: 'submit' });
        break;
      case 'WAITING':
        actions.push({ label: 'กลับมาทำ', status: 'DOING', kind: 'status' });
        break;
      default:
        break;
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
      this.error.set('กรุณาตรวจงานจากหน้า「งานตรวจ」');
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
        this.currentTask.set({
          ...task,
          ...updated,
          project: updated.project ?? task.project ?? null,
          submissions: updated.submissions ?? task.submissions ?? [],
        });
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
    if (task.status !== 'DOING') {
      this.error.set('ส่งตรวจได้เมื่อเข้าเฟสกำลังทำแล้วเท่านั้น — กด「เริ่มงาน」ก่อน');
      return;
    }
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
      ...(this.canAssign() ? { assignedUserId } : {}),
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
        const me = this.auth.currentUser();
        if (me && !saved.assignedByUserId) {
          this.projectsApi.stampAssignerIfMissing(saved.id, {
            id: me.id,
            username: me.username,
            fullName: me.fullName,
          });
          this.usersApi.upsertLocal(me);
        } else if (saved.assignedBy) {
          this.usersApi.upsertLocal(saved.assignedBy);
        }
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
