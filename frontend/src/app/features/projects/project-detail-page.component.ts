import { DatePipe, Location } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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
  TASK_PRIORITIES,
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
import { combineDateAndTime, nowTimeString, toDateOnlyString } from '../../core/utils/date.util';
import { navigateBack } from '../../core/utils/navigation.util';
import { BahtPipe } from '../../shared/pipes/baht.pipe';
import { TaskEditDialogComponent } from './task-edit-dialog.component';

@Component({
  selector: 'app-project-detail-page',
  standalone: true,
  imports: [
    BahtPipe,
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
  private readonly router = inject(Router);
  private readonly location = inject(Location);
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
  readonly taskSearch = signal('');
  readonly taskSearchControl = this.fb.nonNullable.control('');
  readonly deliveries = signal<Delivery[]>([]);
  readonly statusLabels = PROJECT_STATUS_LABELS;
  readonly taskStatusLabels = TASK_STATUS_LABELS;
  readonly taskStatuses = TASK_STATUSES;
  readonly priorityLabels = TASK_PRIORITY_LABELS;
  readonly priorities = TASK_PRIORITIES;
  readonly acceptanceLabels = DELIVERY_ACCEPTANCE_LABELS;
  readonly acceptances = Object.keys(DELIVERY_ACCEPTANCE_LABELS) as DeliveryAcceptance[];
  readonly users = this.usersApi.users;
  readonly taskColumns = ['title', 'priority', 'assignee', 'dueDate', 'status', 'actions'];

  readonly filteredTasks = computed(() => {
    const filter = this.statusFilter();
    const q = this.taskSearch().trim().toLowerCase();
    let list = this.tasks().filter((t) => {
      const matchStatus = filter === 'ALL' || t.status === filter;
      if (!matchStatus) {
        return false;
      }
      if (!q) {
        return true;
      }
      const assignee = this.userName(t.assignedUserId).toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        (t.description ?? '').toLowerCase().includes(q) ||
        assignee.includes(q) ||
        (t.dueDate ?? '').toLowerCase().includes(q) ||
        this.taskStatusLabels[t.status].toLowerCase().includes(q) ||
        this.priorityLabels[t.priority].toLowerCase().includes(q)
      );
    });
    const priorityRank: Record<TaskPriority, number> = {
      URGENT: 0,
      HIGH: 1,
      NORMAL: 2,
      LOW: 3,
    };
    return [...list].sort((a, b) => {
      const byPriority = priorityRank[a.priority] - priorityRank[b.priority];
      if (byPriority !== 0) {
        return byPriority;
      }
      const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      return aDue - bDue;
    });
  });

  readonly statusCounts = computed(() => {
    const list = this.tasks();
    const counts: Record<TaskStatus | 'ALL', number> = {
      ALL: list.length,
      TODO: 0,
      DOING: 0,
      WAITING: 0,
      REVIEW: 0,
      DONE: 0,
    };
    for (const t of list) {
      counts[t.status] += 1;
    }
    return counts;
  });

  private projectId = 0;

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

  goBack(): void {
    navigateBack(this.location, this.router, '/app/projects');
  }

  ngOnInit(): void {
    this.projectId = Number(this.route.snapshot.paramMap.get('id'));
    this.usersApi.list().subscribe();
    this.projectsApi.fetchProject(this.projectId).subscribe({
      next: (project) => {
        this.project.set(project);
        this.notFound.set(false);
        this.customersApi.fetchCustomer(project.customerId).subscribe();
        this.customersApi.listContacts(project.customerId).subscribe();
        const me = this.auth.currentUser();
        if (me) {
          this.deliveryForm.patchValue({ deliveredByUserId: me.id });
        }
        this.refresh();
      },
      error: () => this.notFound.set(true),
    });
    this.taskSearchControl.valueChanges.subscribe((v) => this.taskSearch.set(v));
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
    return this.contacts().find((c) => c.id === id)?.name ?? `#${id}`;
  }

  projectStatusLabel(status: Project['status']): string {
    return this.statusLabels[status];
  }

  refresh(): void {
    this.projectsApi.fetchProject(this.projectId).subscribe({
      next: (project) => {
        this.project.set(project);
        this.progress.set(project.progress?.percent ?? 0);
      },
      error: () => undefined,
    });
    this.projectsApi.listTasks(this.projectId).subscribe({
      next: (tasks) => {
        this.tasks.set(tasks);
        this.progress.set(this.projectsApi.progressPercent(this.projectId));
      },
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
    });
    this.deliveries.set(this.projectsApi.getDeliveries(this.projectId));
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
    this.projectsApi.updateTask(task.projectId, task.id, { priority }).subscribe({
      next: () => this.refresh(),
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3000 }),
    });
  }

  changeAssignee(task: TaskItem, assignedUserId: number | null): void {
    if (task.assignedUserId === assignedUserId) {
      return;
    }
    this.projectsApi.updateTask(task.projectId, task.id, { assignedUserId }).subscribe({
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

  openCreateTask(): void {
    const ref = this.dialog.open(TaskEditDialogComponent, {
      width: '560px',
      maxWidth: '95vw',
      data: { projectId: this.projectId, task: null },
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.refresh();
      }
    });
  }

  openEditTask(task: TaskItem): void {
    const ref = this.dialog.open(TaskEditDialogComponent, {
      width: '560px',
      maxWidth: '95vw',
      data: { projectId: this.projectId, task },
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.refresh();
      }
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
