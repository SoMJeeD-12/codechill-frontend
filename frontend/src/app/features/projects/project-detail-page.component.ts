import { Location } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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
import { PageEvent } from '@angular/material/paginator';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
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
import {
  ApiProjectDocument,
  DOCUMENT_ACCEPT,
  DOCUMENT_MAX_BYTES,
  formatDocumentFileSize,
} from '../../core/models/document.model';
import { Contact } from '../../core/models/customer.model';
import { User } from '../../core/models/user.model';
import { FollowUp, followUpDisplayStatus } from '../../core/models/follow-up.model';
import { MA_STATUS_LABELS, MaContract } from '../../core/models/ma.model';
import {
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  Ticket,
} from '../../core/models/ticket.model';
import { WARRANTY_STATUS_LABELS, Warranty, warrantyMaLinkLabel } from '../../core/models/warranty.model';
import { AuthService } from '../../core/services/auth.service';
import { CustomerService } from '../../core/services/customer.service';
import { DocumentService } from '../../core/services/document.service';
import { FollowUpService } from '../../core/services/follow-up.service';
import { MaService } from '../../core/services/ma.service';
import { ProjectService } from '../../core/services/project.service';
import { QuickActionsService } from '../../core/services/quick-actions.service';
import { TicketService } from '../../core/services/ticket.service';
import { UserService } from '../../core/services/user.service';
import { WarrantyService } from '../../core/services/warranty.service';
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
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { DEFAULT_PAGE_SIZE_OPTIONS, createClientPager } from '../../shared/utils/client-pager';
import { FORM_DIALOG, FORM_DIALOG_WIDE, FORM_DIALOG_COMPACT } from '../../shared/utils/form-dialog';
import { WarrantyFormDialogComponent } from '../warranties/warranties-page.component';
import { ProjectFormDialogComponent } from './projects-page.component';
import {
  FollowUpFormDialogComponent,
  FollowUpFormPreset,
} from '../follow-ups/follow-ups-page.component';

@Component({
  selector: 'app-project-detail-page',
  standalone: true,
  imports: [
    ThaiDatePipe,
    BahtPipe,
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
    MatMenuModule,
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
  private readonly documentsApi = inject(DocumentService);
  private readonly followUpsApi = inject(FollowUpService);
  private readonly warrantiesApi = inject(WarrantyService);
  private readonly ticketsApi = inject(TicketService);
  private readonly maApi = inject(MaService);
  private readonly quickActions = inject(QuickActionsService);
  private readonly usersApi = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);

  readonly project = signal<Project | null>(null);
  readonly notFound = signal(false);
  readonly progress = signal<number | null>(null);
  readonly tasks = signal<TaskItem[]>([]);
  readonly tasksView = signal<'table' | 'board'>('table');
  readonly statusFilter = signal<TaskStatus | 'ALL'>('ALL');
  readonly taskSearch = signal('');
  readonly taskSearchControl = this.fb.nonNullable.control('');
  readonly deliveries = signal<Delivery[]>([]);
  readonly deliverySearch = signal('');
  readonly deliverySearchControl = this.fb.nonNullable.control('');
  readonly documents = signal<ApiProjectDocument[]>([]);
  readonly documentsTotal = signal(0);
  readonly documentsLoading = signal(false);
  readonly documentsDenied = signal(false);
  readonly documentSearch = signal('');
  readonly documentSearchControl = this.fb.nonNullable.control('');
  readonly documentPageIndex = signal(0);
  readonly documentPageSize = signal(10);
  readonly documentPageSizeOptions = [...DEFAULT_PAGE_SIZE_OPTIONS];
  readonly followUps = signal<FollowUp[]>([]);
  readonly followUpsLoading = signal(false);
  readonly followUpSearch = signal('');
  readonly followUpSearchControl = this.fb.nonNullable.control('');
  /** ประกันที่ออกแล้วของโปรเจคนี้ — แสดงในแท็บส่งมอบ */
  readonly warranties = signal<Warranty[]>([]);
  /** ใบแจ้งปัญหาของโปรเจคนี้ */
  readonly projectTickets = signal<Ticket[]>([]);
  readonly ticketsLoading = signal(false);
  /** สัญญา MA ของโปรเจคนี้ */
  readonly maContracts = signal<MaContract[]>([]);
  readonly maLoading = signal(false);
  readonly statusLabels = PROJECT_STATUS_LABELS;
  readonly projectStatuses = PROJECT_STATUSES;
  readonly projectPriorityLabels = PRIORITY_LABELS;
  readonly taskStatusLabels = TASK_STATUS_LABELS;
  readonly taskStatuses = TASK_STATUSES;
  readonly priorityLabels = TASK_PRIORITY_LABELS;
  readonly priorities = TASK_PRIORITIES;
  readonly warrantyStatusLabels = WARRANTY_STATUS_LABELS;
  readonly ticketStatusLabels = TICKET_STATUS_LABELS;
  readonly ticketPriorityLabels = TICKET_PRIORITY_LABELS;
  readonly maStatusLabels = MA_STATUS_LABELS;
  readonly acceptanceLabels = DELIVERY_ACCEPTANCE_LABELS;
  readonly acceptances = Object.keys(DELIVERY_ACCEPTANCE_LABELS) as DeliveryAcceptance[];
  readonly users = this.usersApi.users;
  readonly taskColumns = ['title', 'priority', 'assignee', 'dueDate', 'status', 'actions'];
  readonly deliveryColumns = [
    'title',
    'deliveryNo',
    'deliveredAt',
    'deliveredBy',
    'acceptedBy',
    'acceptance',
    'actions',
  ];
  readonly followUpColumns = ['title', 'status', 'dueDate', 'assignee', 'actions'];
  readonly warrantyColumns = ['delivery', 'period', 'daysLeft', 'maLink', 'status'];
  readonly warrantyMaLinkLabel = warrantyMaLinkLabel;
  readonly ticketColumns = ['ticketNo', 'title', 'status', 'priority', 'reportedAt'];
  readonly maColumns = ['contractNo', 'plan', 'period', 'status'];
  readonly documentColumns = [
    'title',
    'fileName',
    'fileSize',
    'uploadedBy',
    'createdAt',
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
  readonly canViewDocuments = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('document.view');
  });
  readonly canCreateDocument = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('document.create');
  });
  readonly canUpdateDocument = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('document.update');
  });
  readonly canDeleteDocument = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('document.delete');
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
  readonly canCreateFollowUp = computed(() => {
    this.auth.session();
    return this.auth.hasPermission('follow-ups', 'create');
  });
  readonly canViewWarranties = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('warranty.view');
  });
  readonly canViewTickets = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('ticket.view');
  });
  readonly canCreateTicket = computed(() => {
    this.auth.session();
    return this.quickActions.canOpenTicket();
  });
  readonly canViewMa = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('ma.view');
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

  readonly filteredFollowUps = computed(() => {
    const q = this.followUpSearch().trim().toLowerCase();
    const list = this.followUps();
    if (!q) {
      return list;
    }
    return list.filter((f) =>
      [
        f.title,
        followUpDisplayStatus(f),
        f.dueDate,
        f.detail,
        f.assignedUser?.fullName,
        this.userName(f.assignedUserId),
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  });

  readonly tasksPager = createClientPager(this.filteredTasks);
  readonly deliveriesPager = createClientPager(this.filteredDeliveries);
  readonly followUpsPager = createClientPager(this.filteredFollowUps);

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
    this.followUpSearchControl.valueChanges.subscribe((v) => this.followUpSearch.set(v));
    this.documentSearchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((v) => {
        this.documentSearch.set(v);
        this.documentPageIndex.set(0);
        this.loadDocuments();
      });
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

  followUpStatusLabel(f: FollowUp): string {
    return followUpDisplayStatus(f);
  }

  isFollowUpOverdue(f: FollowUp): boolean {
    return this.followUpsApi.isOverdue(f);
  }

  openCreateFollowUp(): void {
    if (!this.canCreateFollowUp()) {
      this.snack.open('คุณไม่มีสิทธิ์สร้างงานติดตาม', 'ปิด', { duration: 3000 });
      return;
    }
    const project = this.project();
    if (!project) {
      return;
    }
    const preset: FollowUpFormPreset = {
      projectId: project.id,
      project: { id: project.id, code: project.code, name: project.name },
    };
    const ref = this.dialog.open(FollowUpFormDialogComponent, {
      ...FORM_DIALOG,
      data: preset,
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.refresh();
      }
    });
  }

  openFollowUpDetail(followUp: FollowUp): void {
    void this.router.navigate(['/app/follow-ups'], {
      queryParams: { highlight: followUp.id },
    });
  }

  projectStatusLabel(status: Project['status']): string {
    return this.statusLabels[status];
  }

  openEditProject(): void {
    const project = this.project();
    if (!project || !this.canUpdateProject()) {
      this.snack.open('ไม่มีสิทธิ์แก้ไขโปรเจค', 'ปิด', { duration: 3000 });
      return;
    }
    const ref = this.dialog.open(ProjectFormDialogComponent, {
      ...FORM_DIALOG_WIDE,
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
      this.snack.open('ไม่มีสิทธิ์ลบโปรเจค', 'ปิด', { duration: 3000 });
      return;
    }
    openConfirmDialog(this.dialog, {
      title: 'ลบโปรเจค',
      message: `ต้องการลบโปรเจค「${project.name}」หรือไม่?\nงานย่อยและการส่งมอบที่เกี่ยวข้องอาจถูกลบด้วย`,
      confirmLabel: 'ลบโปรเจค',
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.projectsApi.deleteProject(project.id).subscribe({
        next: () => {
          this.snack.open('ลบโปรเจคแล้ว', 'ปิด', { duration: 2500 });
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

    this.loadDocuments();

    this.followUpsLoading.set(true);
    this.followUpsApi.list({ projectId: this.projectId, limit: 100 }).subscribe({
      next: (rows) => {
        this.followUps.set(rows);
        this.followUpsLoading.set(false);
      },
      error: () => {
        this.followUps.set([]);
        this.followUpsLoading.set(false);
      },
    });

    this.loadWarranties();
    this.loadProjectTickets();
    this.loadMaContracts();
  }

  /** ประกันที่ออกจากการส่งมอบของโปรเจคนี้ */
  private loadWarranties(): void {
    if (!this.canViewWarranties()) {
      this.warranties.set([]);
      return;
    }
    this.warrantiesApi.listByProject(this.projectId).subscribe({
      next: (rows) => this.warranties.set(rows),
      error: () => this.warranties.set([]),
    });
  }

  private loadProjectTickets(): void {
    if (!this.canViewTickets()) {
      this.projectTickets.set([]);
      return;
    }
    this.ticketsLoading.set(true);
    this.ticketsApi.list({ projectId: this.projectId, limit: 100 }).subscribe({
      next: (rows) => {
        this.projectTickets.set(rows);
        this.ticketsLoading.set(false);
      },
      error: () => {
        this.projectTickets.set([]);
        this.ticketsLoading.set(false);
      },
    });
  }

  private loadMaContracts(): void {
    if (!this.canViewMa()) {
      this.maContracts.set([]);
      return;
    }
    this.maLoading.set(true);
    this.maApi.list({ projectId: this.projectId, limit: 100 }).subscribe({
      next: (rows) => {
        this.maContracts.set(rows);
        this.maLoading.set(false);
      },
      error: () => {
        this.maContracts.set([]);
        this.maLoading.set(false);
      },
    });
  }

  /* ——— ป้ายชื่อสำหรับตาราง (แถวจาก mat-table เป็น any) ——— */

  warrantyStatusLabel(status: Warranty['status']): string {
    return this.warrantyStatusLabels[status] ?? status;
  }

  ticketStatusLabel(status: Ticket['status']): string {
    return this.ticketStatusLabels[status] ?? status;
  }

  ticketPriorityLabel(priority: Ticket['priority']): string {
    return this.ticketPriorityLabels[priority] ?? priority;
  }

  maStatusLabel(status: MaContract['status']): string {
    return this.maStatusLabels[status] ?? status;
  }

  /** เปิดใบแจ้งปัญหาของโปรเจคนี้ — ไม่ต้องเด้งไปเมนูปัญหา */
  openTicketForProject(): void {
    const project = this.project();
    if (!project) {
      return;
    }
    this.quickActions
      .openTicketForm({
        project: { id: project.id, label: project.name, code: project.code },
        customer: project.customer
          ? { id: project.customer.id, label: project.customer.name }
          : null,
      })
      .subscribe((saved) => {
        if (saved) {
          this.loadProjectTickets();
        }
      });
  }

  loadDocuments(): void {
    if (!this.canViewDocuments()) {
      this.documents.set([]);
      this.documentsTotal.set(0);
      this.documentsDenied.set(false);
      this.documentsLoading.set(false);
      return;
    }
    this.documentsLoading.set(true);
    this.documentsDenied.set(false);
    this.documentsApi
      .listByProject(this.projectId, {
        search: this.documentSearch().trim() || undefined,
        page: this.documentPageIndex() + 1,
        limit: this.documentPageSize(),
      })
      .subscribe({
        next: ({ items, total }) => {
          this.documents.set(items);
          this.documentsTotal.set(total);
          this.documentsLoading.set(false);
        },
        error: (err: Error) => {
          this.documents.set([]);
          this.documentsTotal.set(0);
          this.documentsLoading.set(false);
          this.snack.open(err.message, 'ปิด', { duration: 5000 });
        },
      });
  }

  onDocumentsPage(event: PageEvent): void {
    this.documentPageIndex.set(event.pageIndex);
    this.documentPageSize.set(event.pageSize);
    this.loadDocuments();
  }

  formatDocSize(bytes: number): string {
    return formatDocumentFileSize(bytes);
  }

  openUploadDocument(): void {
    if (!this.canCreateDocument()) {
      this.snack.open('ไม่มีสิทธิ์อัปโหลดเอกสาร', 'ปิด', { duration: 3000 });
      return;
    }
    const ref = this.dialog.open(ProjectDocumentUploadDialogComponent, {
      ...FORM_DIALOG,
      data: { projectId: this.projectId },
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.documentPageIndex.set(0);
        this.loadDocuments();
      }
    });
  }

  openEditDocument(doc: ApiProjectDocument): void {
    if (!this.canUpdateDocument()) {
      this.snack.open('ไม่มีสิทธิ์แก้ไขเอกสาร', 'ปิด', { duration: 3000 });
      return;
    }
    const ref = this.dialog.open(ProjectDocumentEditDialogComponent, {
      ...FORM_DIALOG_COMPACT,
      data: { document: doc },
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.loadDocuments();
      }
    });
  }

  downloadDocument(doc: ApiProjectDocument): void {
    if (!this.canViewDocuments()) {
      this.snack.open('ไม่มีสิทธิ์ดาวน์โหลดเอกสาร', 'ปิด', { duration: 3000 });
      return;
    }
    this.documentsApi.download(doc).subscribe({
      next: () => undefined,
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 5000 }),
    });
  }

  removeDocument(doc: ApiProjectDocument): void {
    if (!this.canDeleteDocument()) {
      this.snack.open('ไม่มีสิทธิ์ลบเอกสาร', 'ปิด', { duration: 3000 });
      return;
    }
    openConfirmDialog(this.dialog, {
      title: 'ลบเอกสาร',
      message: `ต้องการลบเอกสาร「${doc.title || doc.fileName}」หรือไม่?`,
      confirmLabel: 'ลบเอกสาร',
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.documentsApi.remove(doc.id).subscribe({
        next: () => {
          this.snack.open('ลบเอกสารแล้ว', 'ปิด', { duration: 2500 });
          this.loadDocuments();
        },
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 5000 }),
      });
    });
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
      ...FORM_DIALOG,
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
      ...FORM_DIALOG,
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
      ...FORM_DIALOG,
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
      ...FORM_DIALOG_COMPACT,
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
      ...FORM_DIALOG,
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
      min-width: min(100%, 42rem);
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
            นี่คือการส่งมอบครั้งสุดท้ายของโปรเจค
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
      min-width: min(720px, 100%);
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

/* ——— Project document upload (B3) ——— */

export interface ProjectDocumentUploadDialogData {
  projectId: number;
}

@Component({
  selector: 'app-project-document-upload-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>อัปโหลดเอกสาร</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="dlg-form" id="project-doc-upload-form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" class="full">
          <mat-label>ชื่อเอกสาร</mat-label>
          <input matInput formControlName="title" placeholder="ว่างไว้จะใช้ชื่อไฟล์" />
        </mat-form-field>

        <label class="file-pick">
          <span>แนบไฟล์ (บังคับ · ไม่เกิน 20 MB)</span>
          <input
            type="file"
            [accept]="accept"
            (change)="onFilePicked($event)"
          />
        </label>
        @if (selectedFileName()) {
          <p class="file-name">{{ selectedFileName() }}</p>
        }

        <mat-form-field appearance="outline" class="full">
          <mat-label>หมายเหตุ</mat-label>
          <textarea matInput rows="2" formControlName="note" placeholder="ไม่บังคับ"></textarea>
        </mat-form-field>

        @if (error()) {
          <p class="error">{{ error() }}</p>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>ยกเลิก</button>
      <button
        mat-flat-button
        color="primary"
        type="submit"
        form="project-doc-upload-form"
        [disabled]="saving()"
      >
        อัปโหลด
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .dlg-form {
      display: grid;
      gap: 0.45rem;
      padding-top: 0.25rem;
      min-width: min(100%, 40rem);
    }
    .full {
      width: 100%;
    }
    .file-pick {
      display: grid;
      gap: 0.35rem;
      font-size: 0.9rem;
      color: #334155;
    }
    .file-name {
      margin: 0;
      font-size: 0.85rem;
      color: #0f766e;
      word-break: break-all;
    }
    .error {
      margin: 0;
      color: #b91c1c;
      font-size: 0.88rem;
    }
  `,
})
export class ProjectDocumentUploadDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(DocumentService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialogRef = inject(MatDialogRef<ProjectDocumentUploadDialogComponent, boolean>);
  readonly data = inject<ProjectDocumentUploadDialogData>(MAT_DIALOG_DATA);

  readonly accept = DOCUMENT_ACCEPT;
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly selectedFileName = signal('');
  private file: File | null = null;

  readonly form = this.fb.group({
    title: [''],
    note: [''],
  });

  onFilePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.file = file;
    this.selectedFileName.set(file?.name ?? '');
    this.error.set(null);
    if (file && file.size > DOCUMENT_MAX_BYTES) {
      this.file = null;
      this.selectedFileName.set('');
      this.error.set('ไฟล์ใหญ่เกิน 20 MB');
      input.value = '';
    }
  }

  save(): void {
    if (!this.file) {
      this.error.set('กรุณาเลือกไฟล์');
      return;
    }
    if (this.file.size > DOCUMENT_MAX_BYTES) {
      this.error.set('ไฟล์ใหญ่เกิน 20 MB');
      return;
    }
    const raw = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);
    this.api
      .uploadToProject(this.data.projectId, {
        file: this.file,
        title: (raw.title ?? '').trim() || undefined,
        note: (raw.note ?? '').trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.snack.open('อัปโหลดเอกสารแล้ว', 'ปิด', { duration: 2500 });
          this.dialogRef.close(true);
        },
        error: (err: Error) => {
          this.saving.set(false);
          this.error.set(err.message);
          this.snack.open(err.message, 'ปิด', { duration: 5000 });
        },
      });
  }
}

/* ——— Project document edit title/note ——— */

export interface ProjectDocumentEditDialogData {
  document: ApiProjectDocument;
}

@Component({
  selector: 'app-project-document-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>แก้ไขเอกสาร</h2>
    <mat-dialog-content>
      <p class="file-hint">{{ data.document.fileName }}</p>
      <form [formGroup]="form" class="dlg-form" id="project-doc-edit-form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" class="full">
          <mat-label>ชื่อเอกสาร</mat-label>
          <input matInput formControlName="title" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>หมายเหตุ</mat-label>
          <textarea matInput rows="3" formControlName="note" placeholder="ว่าง = ล้างหมายเหตุ"></textarea>
        </mat-form-field>
        @if (error()) {
          <p class="error">{{ error() }}</p>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>ยกเลิก</button>
      <button
        mat-flat-button
        color="primary"
        type="submit"
        form="project-doc-edit-form"
        [disabled]="saving()"
      >
        บันทึก
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .file-hint {
      margin: 0 0 0.65rem;
      color: #64748b;
      font-size: 0.88rem;
      word-break: break-all;
    }
    .dlg-form {
      display: grid;
      gap: 0.35rem;
      min-width: min(100%, 40rem);
    }
    .full {
      width: 100%;
    }
    .error {
      margin: 0;
      color: #b91c1c;
      font-size: 0.88rem;
    }
  `,
})
export class ProjectDocumentEditDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(DocumentService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialogRef = inject(MatDialogRef<ProjectDocumentEditDialogComponent, boolean>);
  readonly data = inject<ProjectDocumentEditDialogData>(MAT_DIALOG_DATA);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.group({
    title: [this.data.document.title ?? ''],
    note: [this.data.document.note ?? ''],
  });

  save(): void {
    const raw = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);
    this.api
      .update(this.data.document.id, {
        title: (raw.title ?? '').trim(),
        note: (raw.note ?? '').trim() || null,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.snack.open('บันทึกเอกสารแล้ว', 'ปิด', { duration: 2500 });
          this.dialogRef.close(true);
        },
        error: (err: Error) => {
          this.saving.set(false);
          this.error.set(err.message);
          this.snack.open(err.message, 'ปิด', { duration: 5000 });
        },
      });
  }
}
