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
  readonly data = inject<{ task: TaskItem }>(MAT_DIALOG_DATA);

  readonly users = this.usersApi.users;
  readonly taskStatuses = TASK_STATUSES;
  readonly taskStatusLabels = TASK_STATUS_LABELS;
  readonly priorityLabels = TASK_PRIORITY_LABELS;
  readonly priorities = Object.keys(TASK_PRIORITY_LABELS) as TaskPriority[];
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.group({
    title: [this.data.task.title, Validators.required],
    description: [this.data.task.description],
    status: [this.data.task.status as TaskStatus, Validators.required],
    priority: [this.data.task.priority as TaskPriority, Validators.required],
    assigneeId: [this.data.task.assigneeId as number | null],
    dueDate: [parseDateOnly(this.data.task.dueDate) as Date | null],
  });

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);
    this.projectsApi
      .updateTask(this.data.task.id, {
        title: raw.title ?? '',
        description: raw.description ?? '',
        status: raw.status as TaskStatus,
        priority: raw.priority as TaskPriority,
        assigneeId: raw.assigneeId,
        dueDate: toDateOnlyString(raw.dueDate) || null,
        dependsOnTaskId: this.data.task.dependsOnTaskId,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.snack.open('แก้ไขงานย่อยแล้ว', 'ปิด', { duration: 2500 });
          this.ref.close(true);
        },
        error: (err: Error) => {
          this.saving.set(false);
          this.error.set(err.message);
        },
      });
  }
}
