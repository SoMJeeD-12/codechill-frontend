import { Location } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
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
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  DELIVERY_ACCEPTANCE_LABELS,
  Delivery,
  DeliveryAcceptance,
  PRIORITY_LABELS,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUSES,
  Project,
  ProjectStatus,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TaskItem,
  TaskPriority,
  TaskStatus,
} from '../../core/models/project.model';
import { Contact } from '../../core/models/customer.model';
import { User } from '../../core/models/user.model';
import { AuthService } from '../../core/services/auth.service';
import { CustomerService } from '../../core/services/customer.service';
import { ProjectService } from '../../core/services/project.service';
import { UserService } from '../../core/services/user.service';
import {
  combineDateAndTime,
  nowTimeString,
  toDateOnlyString,
} from '../../core/utils/date.util';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { navigateBack } from '../../core/utils/navigation.util';
import { BahtPipe } from '../../shared/pipes/baht.pipe';
import { ThaiTimeInputDirective } from '../../shared/directives/thai-time-input.directive';
import { openConfirmDialog } from '../../shared/components/confirm-dialog.component';
import { TaskEditDialogComponent } from './task-edit-dialog.component';
import { TaskKanbanBoardComponent } from './task-kanban-board.component';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { createClientPager } from '../../shared/utils/client-pager';
import { WarrantyFormDialogComponent } from '../warranties/warranties-page.component';
import { ProjectFormDialogComponent } from './projects-page.component';

@Component({
  selector: 'app-project-detail-page',
  standalone: true,
  imports: [
    ThaiDatePipe,
    BahtPipe,
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
    MatMenuModule,
    TaskKanbanBoardComponent,
    TablePaginatorComponent,
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
  readonly tasksView = signal<'table' | 'board'>('table');
  readonly statusFilter = signal<TaskStatus | 'ALL'>('ALL');
  readonly taskSearch = signal('');
  readonly taskSearchControl = this.fb.nonNullable.control('');
  readonly deliveries = signal<Delivery[]>([]);
  readonly deliverySearch = signal('');
  readonly deliverySearchControl = this.fb.nonNullable.control('');
  readonly statusLabels = PROJECT_STATUS_LABELS;
  readonly projectStatuses = PROJECT_STATUSES;
  readonly projectPriorityLabels = PRIORITY_LABELS;
  readonly taskStatusLabels = TASK_STATUS_LABELS;
  readonly taskStatuses = TASK_STATUSES;
  readonly priorityLabels = TASK_PRIORITY_LABELS;
  readonly priorities = TASK_PRIORITIES;
  readonly acceptanceLabels = DELIVERY_ACCEPTANCE_LABELS;
  readonly acceptances = Object.keys(DELIVERY_ACCEPTANCE_LABELS) as DeliveryAcceptance[];
  readonly users = this.usersApi.users;
  readonly taskColumns = ['title', 'priority', 'assignee', 'dueDate', 'status', 'actions'];
  readonly deliveryColumns = [
    'title',
    'id',
    'deliveredAt',
    'deliveredBy',
    'acceptedBy',
    'acceptance',
    'actions',
  ];

  /** ซ่อนแท็บ/ยิง API ตามสิทธิ์จริงจาก /auth/me */
  readonly canViewTasks = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('task.view');
  });
  readonly canViewDeliveries = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('delivery.view');
  });
  readonly canCreateDelivery = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('delivery.create');
  });
  readonly canAcceptDelivery = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('delivery.accept');
  });
  readonly canUpdateProject = computed(() => {
    this.auth.session();
    return (
      this.auth.hasPermissionCode('project.update') ||
      this.auth.hasPermission('projects', 'update')
    );
  });
  readonly canDeleteProject = computed(() => {
    this.auth.session();
    return (
      this.auth.hasPermissionCode('project.delete') ||
      this.auth.hasPermission('projects', 'delete') ||
      this.canUpdateProject()
    );
  });
  readonly canDeleteTask = computed(() => {
    this.auth.session();
    return (
      this.auth.hasPermissionCode('task.delete') ||
      this.auth.hasPermissionCode('task.update') ||
      this.canUpdateProject()
    );
  });
  readonly nextProjectStatus = computed((): ProjectStatus | null => {
    const status = this.project()?.status;
    if (!status) {
      return null;
    }
    const order: ProjectStatus[] = ['DRAFT', 'IN_PROGRESS', 'DELIVERED', 'CLOSED'];
    const idx = order.indexOf(status);
    if (idx < 0 || idx >= order.length - 1) {
      return null;
    }
    return order[idx + 1];
  });
  readonly deliveriesDenied = signal(false);
  readonly tasksDenied = signal(false);

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

  readonly filteredDeliveries = computed(() => {
    const q = this.deliverySearch().trim().toLowerCase();
    const list = this.deliveries();
    if (!q) {
      return list;
    }
    return list.filter((d) => {
      const deliveredBy = this.userName(d.deliveredByUserId).toLowerCase();
      const acceptedBy = this.contactName(d.acceptedByContactId).toLowerCase();
      return (
        String(d.id).includes(q) ||
        `ส่งมอบ #${d.id}`.includes(q) ||
        d.title.toLowerCase().includes(q) ||
        (d.deliveryNo ?? '').toLowerCase().includes(q) ||
        (d.version ?? '').toLowerCase().includes(q) ||
        (d.description ?? '').toLowerCase().includes(q) ||
        (d.note ?? '').toLowerCase().includes(q) ||
        deliveredBy.includes(q) ||
        acceptedBy.includes(q) ||
        this.acceptanceLabels[d.acceptanceStatus].toLowerCase().includes(q)
      );
    });
  });

  readonly tasksPager = createClientPager(this.filteredTasks);
  readonly deliveriesPager = createClientPager(this.filteredDeliveries);

  private projectId = 0;

  /** ใช้ส่งเข้า kanban / ลิงก์ */
  get currentProjectId(): number {
    return this.projectId;
  }

  goBack(): void {
    navigateBack(this.location, this.router, '/app/projects');
  }

  ngOnInit(): void {
    this.projectId = Number(this.route.snapshot.paramMap.get('id'));
    this.usersApi.loadForPicker(this.auth.currentUser()).subscribe();
    this.projectsApi.fetchProject(this.projectId).subscribe({
      next: (project) => {
        this.project.set(project);
        this.notFound.set(false);
        this.customersApi.fetchCustomer(project.customerId).subscribe();
        this.customersApi.listContacts(project.customerId).subscribe();
        this.refresh();
      },
      error: () => this.notFound.set(true),
    });
    this.taskSearchControl.valueChanges.subscribe((v) => this.taskSearch.set(v));
    this.deliverySearchControl.valueChanges.subscribe((v) => this.deliverySearch.set(v));
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

  priorityLabel(priority: TaskPriority): string {
    return this.priorityLabels[priority];
  }

  taskStatusLabel(status: TaskStatus): string {
    return this.taskStatusLabels[status];
  }

  contactName(id: number | null): string {
    if (!id) {
      return '—';
    }
    return this.contacts().find((c) => c.id === id)?.name ?? `#${id}`;
  }

  acceptanceLabel(status: DeliveryAcceptance): string {
    return this.acceptanceLabels[status];
  }

  projectStatusLabel(status: Project['status']): string {
    return this.statusLabels[status];
  }

  openEditProject(): void {
    const project = this.project();
    if (!project || !this.canUpdateProject()) {
      this.snack.open('ไม่มีสิทธิ์แก้ไขโครงการ', 'ปิด', { duration: 3000 });
      return;
    }
    const ref = this.dialog.open(ProjectFormDialogComponent, {
      width: '560px',
      maxWidth: '95vw',
      data: { project },
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.refresh();
      }
    });
  }

  changeProjectStatus(status: ProjectStatus): void {
    const project = this.project();
    if (!project || !this.canUpdateProject() || project.status === status) {
      return;
    }
    const payload: { status: ProjectStatus; actualEndDate?: string } = { status };
    if ((status === 'DELIVERED' || status === 'CLOSED') && !project.actualEndDate) {
      payload.actualEndDate = toDateOnlyString(new Date());
    }
    this.projectsApi.updateProject(project.id, payload).subscribe({
      next: () => {
        this.snack.open(`อัปเดตสถานะเป็น「${this.statusLabels[status]}」แล้ว`, 'ปิด', {
          duration: 2500,
        });
        this.refresh();
      },
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
    });
  }

  advanceProjectStatus(): void {
    const next = this.nextProjectStatus();
    if (!next) {
      return;
    }
    this.changeProjectStatus(next);
  }

  removeProject(): void {
    const project = this.project();
    if (!project || !this.canDeleteProject()) {
      this.snack.open('ไม่มีสิทธิ์ลบโครงการ', 'ปิด', { duration: 3000 });
      return;
    }
    openConfirmDialog(this.dialog, {
      title: 'ลบโครงการ',
      message: `ต้องการลบโครงการ「${project.name}」หรือไม่?\nงานย่อยและการส่งมอบที่เกี่ยวข้องอาจถูกลบด้วย`,
      confirmLabel: 'ลบโครงการ',
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.projectsApi.deleteProject(project.id).subscribe({
        next: () => {
          this.snack.open('ลบโครงการแล้ว', 'ปิด', { duration: 2500 });
          void this.router.navigate(['/app/projects']);
        },
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 4000 }),
      });
    });
  }

  removeTask(task: TaskItem): void {
    if (!this.canDeleteTask()) {
      this.snack.open('ไม่มีสิทธิ์ลบงานย่อย', 'ปิด', { duration: 3000 });
      return;
    }
    openConfirmDialog(this.dialog, {
      title: 'ลบงานย่อย',
      message: `ต้องการลบงาน「${task.title}」หรือไม่?`,
      confirmLabel: 'ลบงาน',
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.projectsApi.removeTask(this.projectId, task.id).subscribe({
        next: () => {
          this.snack.open('ลบงานย่อยแล้ว', 'ปิด', { duration: 2500 });
          this.refresh();
        },
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 4000 }),
      });
    });
  }

  projectPriorityLabel(priority: Project['priority']): string {
    return this.projectPriorityLabels[priority];
  }

  refresh(): void {
    this.projectsApi.fetchProject(this.projectId).subscribe({
      next: (project) => {
        this.project.set(project);
        this.progress.set(project.progress?.percent ?? 0);
      },
      error: () => undefined,
    });

    if (this.canViewTasks()) {
      this.tasksDenied.set(false);
      this.projectsApi.listTasks(this.projectId, undefined, { optional: true }).subscribe({
        next: (tasks) => {
          this.tasks.set(tasks);
          this.progress.set(this.projectsApi.progressPercent(this.projectId));
        },
        error: () => {
          this.tasks.set([]);
          this.tasksDenied.set(true);
        },
      });
    } else {
      this.tasks.set([]);
      this.tasksDenied.set(false);
    }

    if (this.canViewDeliveries()) {
      this.deliveriesDenied.set(false);
      this.projectsApi.listDeliveries(this.projectId, { optional: true }).subscribe({
        next: (rows) => this.deliveries.set(rows),
        error: () => {
          this.deliveries.set([]);
          this.deliveriesDenied.set(true);
        },
      });
    } else {
      this.deliveries.set([]);
      this.deliveriesDenied.set(false);
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

  openAddDelivery(): void {
    if (!this.canCreateDelivery()) {
      this.snack.open('ไม่มีสิทธิ์บันทึกการส่งมอบ', 'ปิด', { duration: 3000 });
      return;
    }
    const ref = this.dialog.open(DeliveryFormDialogComponent, {
      width: '560px',
      maxWidth: '95vw',
      data: {
        projectId: this.projectId,
        users: this.users(),
        contacts: this.contacts(),
        defaultDeliveredByUserId: this.auth.currentUser()?.id ?? null,
      },
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.refresh();
      }
    });
  }

  openDeliveryDetail(d: Delivery): void {
    openConfirmDialog(this.dialog, {
      title: d.title,
      message: [
        `ส่งมอบ #${d.id}`,
        `เวอร์ชัน: ${d.version || '—'}`,
        `วันเวลาส่ง: ${d.deliveredAt}`,
        `ผู้ส่งมอบ: ${this.userName(d.deliveredByUserId)}`,
        `ผู้รับมอบ: ${this.contactName(d.acceptedByContactId)}`,
        `สถานะยอมรับ: ${this.acceptanceLabels[d.acceptanceStatus]}`,
        `ครั้งสุดท้าย: ${d.isFinal ? 'ใช่' : 'ไม่ใช่'}`,
        `ออกประกันได้: ${d.canIssueWarranty ? 'ได้' : 'ไม่ได้'}`,
        `รายละเอียด: ${d.description || '—'}`,
        `หมายเหตุ: ${d.note || '—'}`,
      ].join('\n'),
      confirmLabel: 'ปิด',
      hideCancel: true,
    }).subscribe();
  }

  openAcceptDelivery(delivery: Delivery): void {
    if (!this.canAcceptDelivery()) {
      this.snack.open('ไม่มีสิทธิ์ตรวจรับการส่งมอบ', 'ปิด', { duration: 3000 });
      return;
    }
    const ref = this.dialog.open(DeliveryAcceptDialogComponent, {
      width: '480px',
      maxWidth: '95vw',
      data: {
        delivery,
        contacts: this.contacts(),
      },
    });
    ref.afterClosed().subscribe((result: DeliveryAcceptResult | undefined) => {
      if (!result) {
        return;
      }
      this.projectsApi
        .updateDeliveryAcceptance(delivery.id, 'ACCEPTED', {
          acceptedByContactId: result.acceptedByContactId,
          note: result.evidenceNote,
          isFinal: result.isFinal,
        })
        .subscribe({
          next: () => {
            this.snack.open('บันทึกการยอมรับการส่งมอบแล้ว', 'ปิด', { duration: 2500 });
            this.refresh();
          },
          error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 6000 }),
        });
    });
  }

  setAcceptance(delivery: Delivery, acceptanceStatus: DeliveryAcceptance): void {
    if (acceptanceStatus === 'ACCEPTED') {
      this.openAcceptDelivery(delivery);
      return;
    }
    if (delivery.acceptanceStatus === acceptanceStatus) {
      return;
    }
    this.projectsApi
      .updateDeliveryAcceptance(delivery.id, acceptanceStatus, {
        acceptedByContactId: delivery.acceptedByContactId,
      })
      .subscribe({
        next: () => {
          this.snack.open('อัปเดตสถานะการยอมรับแล้ว', 'ปิด', { duration: 2500 });
          this.refresh();
        },
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 6000 }),
      });
  }

  openIssueWarranty(delivery: Delivery): void {
    if (!delivery.canIssueWarranty) {
      this.snack.open(
        'ต้องเป็นการส่งมอบครั้งสุดท้ายที่ลูกค้ายอมรับแล้ว',
        'ปิด',
        { duration: 4000 }
      );
      return;
    }
    const project = this.project();
    if (!project) {
      return;
    }
    const deliveryLabel = `${delivery.title}${delivery.version ? ' · ' + delivery.version : ''}`;
    const warrantyRef = this.dialog.open(WarrantyFormDialogComponent, {
      width: '520px',
      maxWidth: '95vw',
      data: {
        customerId: project.customerId,
        projectId: project.id,
        deliveryId: delivery.id,
        lockDelivery: true,
        deliveryLabel,
      },
    });
    warrantyRef.afterClosed().subscribe((saved) => {
      if (saved) {
        this.snack.open('ออกประกันแล้ว', 'ปิด', { duration: 2500 });
        this.refresh();
      }
    });
  }
}

/* ——— Add delivery dialog ——— */

export interface DeliveryFormDialogData {
  projectId: number;
  users: User[];
  contacts: Contact[];
  defaultDeliveredByUserId: number | null;
}

@Component({
  selector: 'app-delivery-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatDatepickerModule,
    MatSnackBarModule,
    ThaiTimeInputDirective,
  ],
  template: `
    <h2 mat-dialog-title>บันทึกการส่งมอบ</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="dlg-form" id="delivery-form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" class="full">
          <mat-label>หัวข้อการส่งมอบ</mat-label>
          <input matInput formControlName="title" placeholder="เช่น ส่งมอบรอบที่ 1" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>เวอร์ชัน</mat-label>
          <input matInput formControlName="version" placeholder="เช่น v1.0" />
        </mat-form-field>
        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>วันที่ส่ง</mat-label>
            <input matInput [matDatepicker]="deliveryPicker" formControlName="deliveredDate" />
            <mat-datepicker-toggle matIconSuffix [for]="deliveryPicker"></mat-datepicker-toggle>
            <mat-datepicker #deliveryPicker></mat-datepicker>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>เวลาที่ส่ง</mat-label>
            <input matInput appThaiTimeInput formControlName="deliveredTime" />
            <span matTextSuffix>น.</span>
          </mat-form-field>
        </div>
        <mat-form-field appearance="outline" class="full">
          <mat-label>รายละเอียด</mat-label>
          <textarea matInput rows="2" formControlName="description"></textarea>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>ผู้ส่งมอบ</mat-label>
          <mat-select formControlName="deliveredByUserId">
            <mat-option [value]="null">—</mat-option>
            @for (u of data.users; track u.id) {
              <mat-option [value]="u.id">{{ u.fullName }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>ผู้รับมอบ (ฝั่งลูกค้า)</mat-label>
          <mat-select formControlName="acceptedByContactId">
            <mat-option [value]="null">—</mat-option>
            @for (c of data.contacts; track c.id) {
              <mat-option [value]="c.id">{{ c.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>หมายเหตุ</mat-label>
          <textarea matInput rows="2" formControlName="note"></textarea>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button color="primary" type="submit" form="delivery-form" [disabled]="saving()">
        บันทึกส่งมอบ
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .dlg-form {
      display: grid;
      gap: 0.35rem;
      padding-top: 0.25rem;
      min-width: min(100%, 28rem);
    }
    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.55rem;
    }
    .full {
      width: 100%;
    }
    @media (max-width: 560px) {
      .row {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class DeliveryFormDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<DeliveryFormDialogComponent, boolean>);
  private readonly projectsApi = inject(ProjectService);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);
  readonly data = inject<DeliveryFormDialogData>(MAT_DIALOG_DATA);
  readonly saving = signal(false);

  readonly form = this.fb.group({
    title: ['', Validators.required],
    version: [''],
    description: [''],
    deliveredDate: [new Date() as Date | null, Validators.required],
    deliveredTime: [nowTimeString(), Validators.required],
    deliveredByUserId: [this.data.defaultDeliveredByUserId as number | null],
    acceptedByContactId: [null as number | null],
    note: [''],
  });

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.saving.set(true);
    this.projectsApi
      .createDelivery(this.data.projectId, {
        title: (raw.title ?? '').trim(),
        version: (raw.version ?? '').trim() || null,
        description: (raw.description ?? '').trim() || null,
        deliveredAt: combineDateAndTime(raw.deliveredDate, raw.deliveredTime),
        deliveredByUserId: raw.deliveredByUserId,
        acceptedByContactId: raw.acceptedByContactId,
        note: (raw.note ?? '').trim() || null,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.snack.open('บันทึกการส่งมอบแล้ว', 'ปิด', { duration: 2500 });
          this.dialogRef.close(true);
        },
        error: (err: Error) => {
          this.saving.set(false);
          this.snack.open(err.message, 'ปิด', { duration: 3500 });
        },
      });
  }
}

/* ——— Accept delivery dialog ——— */

export interface DeliveryAcceptDialogData {
  delivery: Delivery;
  contacts: Contact[];
}

export interface DeliveryAcceptResult {
  acceptedByContactId: number;
  evidenceNote: string | null;
  isFinal: boolean;
}

@Component({
  selector: 'app-delivery-accept-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatCheckboxModule,
  ],
  template: `
    <h2 mat-dialog-title>ยอมรับการส่งมอบ</h2>
    <mat-dialog-content>
      <p class="accept-lead">
        {{ data.delivery.title }}
        @if (data.delivery.version) {
          · {{ data.delivery.version }}
        }
      </p>
      <form [formGroup]="form" class="dlg-form" id="delivery-accept-form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" class="full">
          <mat-label>ผู้รับมอบ *</mat-label>
          <mat-select formControlName="acceptedByContactId">
            @for (c of data.contacts; track c.id) {
              <mat-option [value]="c.id">{{ c.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>หลักฐานการยอมรับ</mat-label>
          <textarea
            matInput
            rows="3"
            formControlName="evidenceNote"
            placeholder='เช่น ข้อความจากลูกค้า "โอเคค่ะ"'
          ></textarea>
          <mat-hint>แนบไฟล์ยังไม่พร้อม — ใส่ข้อความหลักฐานชั่วคราวได้</mat-hint>
        </mat-form-field>
        <label class="final-check">
          <mat-checkbox formControlName="isFinal"></mat-checkbox>
          <span>
            นี่คือการส่งมอบครั้งสุดท้ายของโครงการ
            <span class="final-hint">ติ๊กเฉพาะเมื่อปิดงานจริง — เฟส/เวอร์ชันทดลองไม่ต้องติ๊ก</span>
          </span>
        </label>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>ยกเลิก</button>
      <button
        mat-flat-button
        color="primary"
        type="submit"
        form="delivery-accept-form"
      >
        ยืนยันยอมรับ
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .accept-lead {
      margin: 0 0 0.75rem;
      color: #334155;
      font-weight: 600;
    }
    .dlg-form {
      display: grid;
      gap: 0.35rem;
      min-width: min(420px, 100%);
    }
    .full {
      width: 100%;
    }
    .final-check {
      display: flex;
      align-items: flex-start;
      gap: 0.35rem;
      margin: 0.5rem 0 0.25rem;
      cursor: pointer;
      font-size: 0.9rem;
      color: #1e293b;
      line-height: 1.4;
    }
    .final-hint {
      display: block;
      margin-top: 0.2rem;
      font-size: 0.78rem;
      color: #64748b;
      font-weight: 400;
    }
  `,
})
export class DeliveryAcceptDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly ref = inject(MatDialogRef<DeliveryAcceptDialogComponent, DeliveryAcceptResult>);
  readonly data = inject<DeliveryAcceptDialogData>(MAT_DIALOG_DATA);

  readonly form = this.fb.group({
    acceptedByContactId: [
      this.data.delivery.acceptedByContactId ?? (null as number | null),
      Validators.required,
    ],
    evidenceNote: [this.data.delivery.note ?? ''],
    isFinal: [!!this.data.delivery.isFinal],
  });

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.ref.close({
      acceptedByContactId: Number(raw.acceptedByContactId),
      evidenceNote: (raw.evidenceNote ?? '').trim() || null,
      isFinal: !!raw.isFinal,
    });
  }
}
