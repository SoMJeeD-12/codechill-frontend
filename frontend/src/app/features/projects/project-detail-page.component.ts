import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  DELIVERY_ACCEPTANCE_LABELS,
  Delivery,
  DeliveryAcceptance,
  PROJECT_STATUS_LABELS,
  Project,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TaskItem,
  TaskPriority,
  TaskStatus,
} from '../../core/models/project.model';
import { AuthService } from '../../core/services/auth.service';
import { CustomerService } from '../../core/services/customer.service';
import { ProjectService } from '../../core/services/project.service';
import { UserService } from '../../core/services/user.service';
import {
  combineDateAndTime,
  nowTimeString,
  toDateOnlyString,
} from '../../core/utils/date.util';
import { TaskEditDialogComponent } from './task-edit-dialog.component';

@Component({
  selector: 'app-project-detail-page',
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    RouterLink,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
    MatTableModule,
    MatTooltipModule,
    MatDialogModule,
    MatDatepickerModule,
  ],
  templateUrl: './project-detail-page.component.html',
  styleUrl: './project-detail-page.component.scss',
})
export class ProjectDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly projectsApi = inject(ProjectService);
  private readonly customersApi = inject(CustomerService);
  private readonly usersApi = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly project = signal<Project | null>(null);
  readonly notFound = signal(false);
  readonly progress = signal(0);
  readonly tasks = signal<TaskItem[]>([]);
  readonly statusFilter = signal<TaskStatus | 'ALL'>('ALL');
  readonly deliveries = signal<Delivery[]>([]);
  readonly statusLabels = PROJECT_STATUS_LABELS;
  readonly taskStatusLabels = TASK_STATUS_LABELS;
  readonly taskStatuses = TASK_STATUSES;
  readonly priorityLabels = TASK_PRIORITY_LABELS;
  readonly priorities = Object.keys(TASK_PRIORITY_LABELS) as TaskPriority[];
  readonly acceptanceLabels = DELIVERY_ACCEPTANCE_LABELS;
  readonly acceptances = Object.keys(DELIVERY_ACCEPTANCE_LABELS) as DeliveryAcceptance[];
  readonly users = this.usersApi.users;
  readonly taskColumns = ['title', 'priority', 'assignee', 'dueDate', 'status', 'actions'];

  readonly filteredTasks = computed(() => {
    const filter = this.statusFilter();
    const list = this.tasks();
    return filter === 'ALL' ? list : list.filter((t) => t.status === filter);
  });

  readonly statusCounts = computed(() => {
    const list = this.tasks();
    const counts: Record<TaskStatus | 'ALL', number> = {
      ALL: list.length,
      TODO: 0,
      IN_PROGRESS: 0,
      REVIEW: 0,
      DONE: 0,
    };
    for (const t of list) {
      counts[t.status] += 1;
    }
    return counts;
  });

  private projectId = 0;

  readonly taskForm = this.fb.group({
    title: ['', Validators.required],
    description: [''],
    status: ['TODO' as TaskStatus],
    priority: ['MEDIUM' as TaskPriority],
    assigneeId: [null as number | null],
    dueDate: [null as Date | null],
  });

  readonly deliveryForm = this.fb.group({
    version: ['', Validators.required],
    deliveredDate: [new Date() as Date | null, Validators.required],
    deliveredTime: [nowTimeString(), Validators.required],
    deliveredByUserId: [0, Validators.min(1)],
    receivedByContactId: [null as number | null],
    acceptance: ['PENDING' as DeliveryAcceptance],
    note: [''],
    attachmentName: [''],
  });

  ngOnInit(): void {
    this.projectId = Number(this.route.snapshot.paramMap.get('id'));
    const project = this.projectsApi.getProject(this.projectId);
    if (!project) {
      this.notFound.set(true);
      return;
    }
    this.project.set(project);
    const me = this.auth.currentUser();
    if (me) {
      this.deliveryForm.patchValue({ deliveredByUserId: me.id });
    }
    this.refresh();
  }

  customerName(): string {
    const id = this.project()?.customerId;
    return id ? this.customersApi.getCustomer(id)?.name ?? `#${id}` : '—';
  }

  contacts() {
    const id = this.project()?.customerId;
    return id ? this.customersApi.getContacts(id) : [];
  }

  userName(id: number | null): string {
    if (!id) {
      return '—';
    }
    return this.usersApi.getById(id)?.fullName ?? `#${id}`;
  }

  contactName(id: number | null): string {
    if (!id) {
      return '—';
    }
    return this.contacts().find((c) => c.id === id)?.fullName ?? `#${id}`;
  }

  projectStatusLabel(status: Project['status']): string {
    return this.statusLabels[status];
  }

  refresh(): void {
    this.tasks.set(this.projectsApi.getTasks(this.projectId));
    this.progress.set(this.projectsApi.progressPercent(this.projectId));
    this.deliveries.set(this.projectsApi.getDeliveries(this.projectId));
    const p = this.projectsApi.getProject(this.projectId);
    if (p) {
      this.project.set(p);
    }
  }

  setStatusFilter(filter: TaskStatus | 'ALL'): void {
    this.statusFilter.set(filter);
  }

  changeStatus(task: TaskItem, status: TaskStatus): void {
    if (task.status === status) {
      return;
    }
    this.projectsApi.updateTaskStatus(task.id, status).subscribe({
      next: () => {
        this.snack.open(`อัปเดตเป็น“${this.taskStatusLabels[status]}”แล้ว`, 'ปิด', {
          duration: 2000,
        });
        this.refresh();
      },
      error: (err: Error) => {
        this.snack.open(err.message, 'ปิด', { duration: 3000 });
        this.refresh();
      },
    });
  }

  changePriority(task: TaskItem, priority: TaskPriority): void {
    if (task.priority === priority) {
      return;
    }
    this.projectsApi
      .updateTask(task.id, {
        title: task.title,
        description: task.description,
        status: task.status,
        priority,
        assigneeId: task.assigneeId,
        dueDate: task.dueDate,
        dependsOnTaskId: task.dependsOnTaskId,
      })
      .subscribe({
        next: () => this.refresh(),
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3000 }),
      });
  }

  changeAssignee(task: TaskItem, assigneeId: number | null): void {
    if (task.assigneeId === assigneeId) {
      return;
    }
    this.projectsApi
      .updateTask(task.id, {
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        assigneeId,
        dueDate: task.dueDate,
        dependsOnTaskId: task.dependsOnTaskId,
      })
      .subscribe({
        next: () => this.refresh(),
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3000 }),
      });
  }

  /** กดปุ่มเลื่อนสถานะไปขั้นถัดไป */
  advanceStatus(task: TaskItem): void {
    const order = this.taskStatuses;
    const idx = order.indexOf(task.status);
    if (idx < 0 || idx >= order.length - 1) {
      return;
    }
    this.changeStatus(task, order[idx + 1]);
  }

  openEditTask(task: TaskItem): void {
    const ref = this.dialog.open(TaskEditDialogComponent, {
      width: '520px',
      maxWidth: '95vw',
      data: { task },
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.refresh();
      }
    });
  }

  addTask(): void {
    if (this.taskForm.invalid) {
      this.taskForm.markAllAsTouched();
      return;
    }
    const raw = this.taskForm.getRawValue();
    this.projectsApi
      .createTask(this.projectId, {
        title: raw.title ?? '',
        description: raw.description ?? '',
        status: (raw.status as TaskStatus) ?? 'TODO',
        priority: (raw.priority as TaskPriority) ?? 'MEDIUM',
        assigneeId: raw.assigneeId,
        dueDate: toDateOnlyString(raw.dueDate) || null,
        dependsOnTaskId: null,
      })
      .subscribe({
        next: () => {
          this.snack.open('เพิ่มงานย่อยแล้ว', 'ปิด', { duration: 2500 });
          this.taskForm.reset({
            title: '',
            description: '',
            status: 'TODO',
            priority: 'MEDIUM',
            assigneeId: null,
            dueDate: null,
          });
          this.refresh();
        },
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
      });
  }

  addDelivery(): void {
    if (this.deliveryForm.invalid) {
      this.deliveryForm.markAllAsTouched();
      return;
    }
    const raw = this.deliveryForm.getRawValue();
    this.projectsApi
      .createDelivery(this.projectId, {
        version: raw.version ?? '',
        deliveredAt: combineDateAndTime(raw.deliveredDate, raw.deliveredTime),
        deliveredByUserId: Number(raw.deliveredByUserId),
        receivedByContactId: raw.receivedByContactId,
        acceptance: (raw.acceptance as DeliveryAcceptance) ?? 'PENDING',
        note: raw.note ?? '',
        attachmentName: (raw.attachmentName ?? '').trim() || null,
      })
      .subscribe({
        next: () => {
          this.snack.open('บันทึกการส่งมอบแล้ว', 'ปิด', { duration: 2500 });
          this.deliveryForm.patchValue({
            version: '',
            note: '',
            attachmentName: '',
            deliveredDate: new Date(),
            deliveredTime: nowTimeString(),
          });
          this.refresh();
        },
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
      });
  }

  setAcceptance(delivery: Delivery, acceptance: DeliveryAcceptance): void {
    this.projectsApi.updateDeliveryAcceptance(delivery.id, acceptance).subscribe({
      next: () => {
        this.snack.open('อัปเดตสถานะการยอมรับแล้ว', 'ปิด', { duration: 2500 });
        this.refresh();
      },
    });
  }
}
