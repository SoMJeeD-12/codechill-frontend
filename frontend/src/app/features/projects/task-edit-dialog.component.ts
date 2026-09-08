import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TaskItem,
  TaskPriority,
  TaskStatus,
} from '../../core/models/project.model';
import { ProjectService } from '../../core/services/project.service';
import { UserService } from '../../core/services/user.service';
import { parseDateOnly, toDateOnlyString } from '../../core/utils/date.util';

export interface TaskDialogData {
  projectId: number;
  task: TaskItem | null;
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
    MatSnackBarModule,
    MatDatepickerModule,
  ],
  templateUrl: './task-edit-dialog.component.html',
  styleUrl: './task-edit-dialog.component.scss',
})
export class TaskEditDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly projectsApi = inject(ProjectService);
  private readonly usersApi = inject(UserService);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject(MatDialogRef<TaskEditDialogComponent, boolean>);
  readonly data = inject<TaskDialogData>(MAT_DIALOG_DATA);

  readonly isEdit = !!this.data.task;
  readonly users = this.usersApi.users;
  readonly taskStatuses = TASK_STATUSES;
  readonly taskStatusLabels = TASK_STATUS_LABELS;
  readonly priorityLabels = TASK_PRIORITY_LABELS;
  readonly priorities = Object.keys(TASK_PRIORITY_LABELS) as TaskPriority[];
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.group({
    title: [this.data.task?.title ?? '', Validators.required],
    description: [this.data.task?.description ?? ''],
    status: [(this.data.task?.status ?? 'TODO') as TaskStatus, Validators.required],
    priority: [(this.data.task?.priority ?? 'MEDIUM') as TaskPriority, Validators.required],
    assigneeId: [this.data.task?.assigneeId ?? (null as number | null)],
    dueDate: [parseDateOnly(this.data.task?.dueDate) as Date | null],
  });

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const payload = {
      title: raw.title ?? '',
      description: raw.description ?? '',
      status: raw.status as TaskStatus,
      priority: raw.priority as TaskPriority,
      assigneeId: raw.assigneeId,
      dueDate: toDateOnlyString(raw.dueDate) || null,
      dependsOnTaskId: this.data.task?.dependsOnTaskId ?? null,
    };
    this.saving.set(true);
    this.error.set(null);

    const req = this.isEdit
      ? this.projectsApi.updateTask(this.data.task!.id, payload)
      : this.projectsApi.createTask(this.data.projectId, payload);

    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.snack.open(this.isEdit ? 'แก้ไขงานย่อยแล้ว' : 'เพิ่มงานย่อยแล้ว', 'ปิด', {
          duration: 2500,
        });
        this.ref.close(true);
      },
      error: (err: Error) => {
        this.saving.set(false);
        this.error.set(err.message);
      },
    });
  }
}
