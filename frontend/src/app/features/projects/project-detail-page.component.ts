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
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import {
  DELIVERY_ACCEPTANCE_LABELS,
  Delivery,
  DeliveryAcceptance,
  PRIORITY_LABELS,
  PROJECT_STATUS_LABELS,
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
import { TicketDemoOverlayService } from '../../core/services/ticket-demo-overlay.service';
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
import { DeliveryPreviewDialogComponent } from './delivery-preview-dialog.component';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { DEFAULT_PAGE_SIZE_OPTIONS, createClientPager } from '../../shared/utils/client-pager';
import { FORM_DIALOG, FORM_DIALOG_WIDE, FORM_DIALOG_COMPACT } from '../../shared/utils/form-dialog';
import { DocumentPreviewDialogComponent } from '../documents/document-preview-dialog.component';
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
  private readonly ticketDemoOverlay = inject(TicketDemoOverlayService);
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
  readonly warrantySearchControl = this.fb.nonNullable.control('');
  readonly warrantySearch = signal('');
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
  readonly ticketsLoadError = signal<string | null>(null);
  readonly ticketSearch = signal('');
  readonly ticketSearchControl = this.fb.nonNullable.control('');
  /** สัญญา MA ของโปรเจคนี้ */
  readonly maContracts = signal<MaContract[]>([]);
  readonly maLoading = signal(false);
  readonly statusLabels = PROJECT_STATUS_LABELS;
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
  readonly users = this.usersApi.assignableTask;
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
  readonly warrantyColumns = ['code', 'delivery', 'period', 'daysLeft', 'maLink', 'status'];
  readonly warrantyMaLinkLabel = warrantyMaLinkLabel;
  readonly ticketColumns = ['ticketNo', 'title', 'status', 'priority', 'reportedAt', 'actions'];
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
  readonly canCreateTask = computed(() => {
    this.auth.session();
    return (
      this.auth.hasPermissionCode('task.create') || this.auth.hasPermissionCode('task.update')
    );
  });
  readonly canUpdateTask = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('task.update');
  });
  readonly canViewDeliveries = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('delivery.view');
  });
  readonly canCreateDelivery = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('delivery.create');
  });
  /** บันทึกส่งมอบได้เฉพาะตอนกำลังดำเนินการ — ร่าง/ส่งมอบแล้ว/ปิด/ยกเลิก ห้าม */
  readonly canRecordDelivery = computed(() => {
    const status = this.project()?.status;
    return this.canCreateDelivery() && status === 'IN_PROGRESS';
  });
  readonly canAcceptDelivery = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('delivery.accept');
  });
  /**
   * ขั้นถัดไปที่กดมือได้:
   * - ร่าง → กำลังดำเนินการ
   * - ส่งมอบแล้ว → ปิดโปรเจค (ถึงขั้นนี้ได้ก็ต่อเมื่อ BE ยอมรับรอบสุดท้ายแล้ว)
   * ส่งมอบแล้วจาก IN_PROGRESS ให้ BE เปลี่ยนเอง — ห้ามกดมือ
   */
  readonly nextProjectStatus = computed((): ProjectStatus | null => {
    const status = this.project()?.status;
    if (status === 'DRAFT') {
      return 'IN_PROGRESS';
    }
    if (status === 'DELIVERED') {
      return 'CLOSED';
    }
    return null;
  });
  /** checklist ทวนความพร้อมก่อนปิด / ออกประกัน ในแท็บส่งมอบ */
  readonly deliveryReadiness = computed(() => {
    const status = this.project()?.status;
    const deliveries = this.deliveries();
    const started =
      status === 'IN_PROGRESS' || status === 'DELIVERED' || status === 'CLOSED';
    const hasDelivery = deliveries.length > 0;
    const finalAccepted =
      status === 'DELIVERED' ||
      status === 'CLOSED' ||
      deliveries.some((d) => d.acceptanceStatus === 'ACCEPTED' && d.isFinal);
    const issuedWarranty = this.warranties().length > 0;
    const canIssue = deliveries.some((d) => d.canIssueWarranty);

    const items: { id: string; ok: boolean; label: string }[] = [
      {
        id: 'started',
        ok: started,
        label: started
          ? 'เริ่มดำเนินการแล้ว'
          : 'ยังเป็นร่าง — ต้องเริ่มดำเนินการก่อน',
      },
      {
        id: 'delivery',
        ok: hasDelivery,
        label: hasDelivery ? 'มีรายการส่งมอบแล้ว' : 'ยังไม่มีรายการส่งมอบ',
      },
      {
        id: 'final',
        ok: finalAccepted,
        label: finalAccepted
          ? 'ยอมรับรอบสุดท้ายแล้ว'
          : 'ยังไม่มียอมรับการส่งมอบรอบสุดท้าย',
      },
    ];
    if (this.canViewWarranties()) {
      items.push({
        id: 'warranty',
        ok: issuedWarranty || canIssue,
        label: issuedWarranty
          ? 'ออกประกันแล้ว'
          : canIssue
            ? 'พร้อมออกประกัน'
            : 'ยังออกประกันไม่ได้',
      });
    }
    return items;
  });
  /**
   * แถบขั้นถัดไปในแท็บส่งมอบ — โชว์เฉพาะตอนยังมีสิ่งที่ต้องทำ
   * (ไม่โชว์เช็คลิสต์ครบแล้ว / โปรเจคปิด — รบกวนตอนเข้ามาดู)
   */
  readonly deliveryNextHint = computed(() => {
    const status = this.project()?.status;
    if (!status || status === 'CLOSED' || status === 'CANCELLED') {
      return null;
    }

    const items = this.deliveryReadiness();
    const blockers = items.filter((i) => !i.ok).map((i) => i.label);

    if (status === 'DRAFT') {
      // ปุ่มเริ่มอยู่ที่หัวหน้า「ขั้นถัดไป」แล้ว — แถบนี้แค่บอกเหตุผล ไม่ซ้ำปุ่ม
      return {
        title: 'โปรเจคยังเป็นร่าง',
        detail:
          'กด「ขั้นถัดไป · กำลังดำเนินการ」ด้านบนก่อน จึงจะบันทึกส่งมอบและออกประกันได้',
        blockers: [] as string[],
      };
    }

    if (status === 'IN_PROGRESS') {
      if (blockers.length === 0) {
        return null;
      }
      // ปุ่ม「บันทึกการส่งมอบ」อยู่ที่ toolbar รายการแล้ว — แถบนี้แค่บอกสิ่งที่ค้าง ไม่ซ้ำปุ่ม
      return {
        title: 'สิ่งที่ยังค้างก่อนส่งมอบครบ',
        detail: blockers[0],
        blockers,
      };
    }

    // DELIVERED: ปุ่มปิดอยู่ที่หัวหน้าแล้ว — ไม่ซ้ำการ์ดทวน
    return null;
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
    // BE ยังไม่มี DELETE /api/projects/:id — ซ่อนปุ่ม
    return false;
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
  readonly canCloseTicket = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('ticket.close');
  });
  readonly canViewMa = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('ma.view');
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
      // คงลำดับจาก backend (deliveredAt DESC · id รอง)
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

  readonly filteredProjectTickets = computed(() => {
    const q = this.ticketSearch().trim().toLowerCase();
    const list = this.projectTickets();
    const filtered = !q
      ? list
      : list.filter((t) => {
          return (
            (t.ticketNo ?? '').toLowerCase().includes(q) ||
            (t.title ?? '').toLowerCase().includes(q) ||
            this.ticketStatusLabel(t.status).toLowerCase().includes(q) ||
            this.ticketPriorityLabel(t.priority).toLowerCase().includes(q)
          );
        });
    return [...filtered].sort(
      (a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime()
    );
  });

  readonly filteredWarranties = computed(() => {
    const q = this.warrantySearch().trim().toLowerCase();
    const list = this.warranties();
    if (!q) {
      return list;
    }
    return list.filter((w) => {
      return (
        (w.code ?? '').toLowerCase().includes(q) ||
        (w.delivery?.title ?? '').toLowerCase().includes(q) ||
        this.warrantyStatusLabel(w.status).toLowerCase().includes(q) ||
        this.warrantyMaLinkLabel(w).toLowerCase().includes(q) ||
        (w.startDate ?? '').toLowerCase().includes(q) ||
        (w.endDate ?? '').toLowerCase().includes(q)
      );
    });
  });

  readonly tasksPager = createClientPager(this.filteredTasks);
  readonly deliveriesPager = createClientPager(this.filteredDeliveries);
  readonly warrantiesPager = createClientPager(this.filteredWarranties);
  readonly followUpsPager = createClientPager(this.filteredFollowUps);
  readonly projectTicketsPager = createClientPager(this.filteredProjectTickets);

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
    this.usersApi.loadForPicker(this.auth.currentUser(), { capability: 'TASK' }).subscribe();
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
    this.warrantySearchControl.valueChanges.subscribe((v) => {
      this.warrantySearch.set(v);
      this.warrantiesPager.reset();
    });
    this.followUpSearchControl.valueChanges.subscribe((v) => this.followUpSearch.set(v));
    this.ticketSearchControl.valueChanges.subscribe((v) => {
      this.ticketSearch.set(v);
      this.projectTicketsPager.reset();
    });
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

  advanceProjectStatus(): void {
    const next = this.nextProjectStatus();
    if (!next) {
      const status = this.project()?.status;
      if (status === 'IN_PROGRESS') {
        this.snack.open(
          'สถานะ「ส่งมอบแล้ว」จะเปลี่ยนเองเมื่อลูกค้ายอมรับการส่งมอบรอบสุดท้าย — ไม่ต้องกดมือ',
          'ปิด',
          { duration: 4500 }
        );
      } else if (status === 'DELIVERED') {
        this.snack.open(
          'ปิดโปรเจคได้เมื่อมีการส่งมอบครั้งสุดท้ายที่ลูกค้ายอมรับแล้ว',
          'ปิด',
          { duration: 4000 }
        );
      }
      return;
    }
    this.changeProjectStatus(next);
  }

  changeProjectStatus(status: ProjectStatus): void {
    const project = this.project();
    if (!project || !this.canUpdateProject() || project.status === status) {
      return;
    }
    // กันข้ามขั้นผิดทางแม้เรียกจากที่อื่น
    if (status === 'DELIVERED' && project.status !== 'DELIVERED') {
      this.snack.open(
        'สถานะ「ส่งมอบแล้ว」มาจากการยอมรับการส่งมอบรอบสุดท้ายเท่านั้น',
        'ปิด',
        { duration: 4000 }
      );
      return;
    }
    if (status === 'CLOSED') {
      if (project.status !== 'DELIVERED') {
        this.snack.open('ต้องเป็นสถานะ「ส่งมอบแล้ว」ก่อนปิดโปรเจค', 'ปิด', {
          duration: 3500,
        });
        return;
      }
    }
    if (status === 'IN_PROGRESS' && project.status !== 'DRAFT') {
      this.snack.open('เปลี่ยนเป็น「กำลังดำเนินการ」ได้จากสถานะร่างเท่านั้น', 'ปิด', {
        duration: 3500,
      });
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

  loadProjectTickets(): void {
    if (!this.canViewTickets()) {
      this.projectTickets.set([]);
      this.ticketsLoadError.set(null);
      return;
    }
    this.ticketsLoading.set(true);
    this.ticketsLoadError.set(null);
    this.ticketsApi
      .listAll({ projectId: this.projectId })
      .pipe(switchMap((rows) => this.ticketsApi.enrichIncompleteWork(rows)))
      .subscribe({
        next: (rows) => {
          this.projectTickets.set(rows);
          this.projectTicketsPager.reset();
          this.ticketsLoading.set(false);
        },
        error: (err: Error) => {
          this.projectTickets.set([]);
          this.projectTicketsPager.reset();
          this.ticketsLoading.set(false);
          this.ticketsLoadError.set(err.message || 'โหลดใบแจ้งปัญหาไม่สำเร็จ');
        },
      });
  }

  /** ปิดงานใบปัญหา — แทนการลบ (ใบยัง reopen ได้) */
  closeProjectTicket(row: Ticket): void {
    if (!this.canCloseTicket()) {
      this.snack.open('ไม่มีสิทธิ์ปิดงานใบแจ้งปัญหา', 'ปิด', { duration: 3000 });
      return;
    }
    if (row.status === 'CLOSED') {
      return;
    }
    openConfirmDialog(this.dialog, {
      title: 'ปิดงานใบแจ้งปัญหา',
      message: `ต้องการปิดงาน「${row.title}」หรือไม่?\nใบจะออกจากคิวเปิด แต่เปิดรอบใหม่ (reopen) ได้ภายหลัง`,
      confirmLabel: 'ปิดงาน',
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.ticketsApi.close(row.id).subscribe({
        next: () => {
          this.snack.open('ปิดงานใบแจ้งปัญหาแล้ว', 'ปิด', { duration: 2500 });
          this.loadProjectTickets();
        },
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 5000 }),
      });
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

  ticketStatusLabelFor(ticket: Ticket): string {
    this.ticketDemoOverlay.state();
    return (
      this.ticketDemoOverlay.incompleteStatusLabel(ticket) ??
      this.ticketStatusLabels[this.ticketDemoOverlay.effectiveStatus(ticket)] ??
      ticket.status
    );
  }

  ticketStatusAttr(ticket: Ticket): string {
    this.ticketDemoOverlay.state();
    return this.ticketDemoOverlay.statusAttr(ticket);
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

  openDocumentPreview(doc: ApiProjectDocument): void {
    if (!this.canViewDocuments()) {
      this.snack.open('ไม่มีสิทธิ์ดูเอกสาร', 'ปิด', { duration: 3000 });
      return;
    }
    this.dialog.open(DocumentPreviewDialogComponent, {
      ...FORM_DIALOG_WIDE,
      data: { document: doc },
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
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 4500 }),
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
    if (!this.canCreateTask()) {
      this.snack.open('ไม่มีสิทธิ์เพิ่มงาน', 'ปิด', { duration: 3000 });
      return;
    }
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

  /** มอบหมาย = เปิดฟอร์มสร้างงาน พร้อมเลือกผู้รับผิดชอบจาก /users/assignable */
  openAssignTask(): void {
    if (!this.canUpdateTask() && !this.canCreateTask()) {
      this.snack.open('ไม่มีสิทธิ์มอบหมายงาน (task.update)', 'ปิด', { duration: 3000 });
      return;
    }
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
      ...FORM_DIALOG_COMPACT,
      data: {
        projectId: this.projectId,
        task,
        readOnly: !this.canUpdateTask(),
      },
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.refresh();
      }
    });
  }

  openAddDelivery(): void {
    if (!this.canRecordDelivery()) {
      const status = this.project()?.status;
      if (!this.canCreateDelivery()) {
        this.snack.open('ไม่มีสิทธิ์บันทึกการส่งมอบ', 'ปิด', { duration: 3000 });
      } else if (status === 'DRAFT') {
        this.snack.open(
          'โปรเจคยังเป็นร่าง — กด「ขั้นถัดไป · กำลังดำเนินการ」ก่อนจึงบันทึกการส่งมอบได้',
          'ปิด',
          { duration: 4500 }
        );
      } else {
        this.snack.open('บันทึกการส่งมอบได้เฉพาะตอนสถานะ「กำลังดำเนินการ」', 'ปิด', {
          duration: 4000,
        });
      }
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
    this.dialog.open(DeliveryPreviewDialogComponent, {
      ...FORM_DIALOG_COMPACT,
      data: {
        delivery: d,
        deliveredByName: this.userName(d.deliveredByUserId),
        acceptedByName: this.contactName(d.acceptedByContactId),
      },
    });
  }

  openAcceptDelivery(delivery: Delivery): void {
    if (!this.canAcceptDelivery()) {
      this.snack.open('ไม่มีสิทธิ์ตรวจรับการส่งมอบ', 'ปิด', { duration: 3000 });
      return;
    }
    const project = this.project();
    if (!project) {
      return;
    }
    const ref = this.dialog.open(DeliveryAcceptDialogComponent, {
      ...FORM_DIALOG_COMPACT,
      data: {
        delivery,
        contacts: this.contacts(),
        projectId: project.id,
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
            this.snack.open(
              result.isFinal
                ? 'ยอมรับรอบสุดท้ายแล้ว — ระบบจะเปลี่ยนสถานะโปรเจคเป็น「ส่งมอบแล้ว」'
                : 'บันทึกการยอมรับการส่งมอบแล้ว',
              'ปิด',
              { duration: 4000 }
            );
            this.refresh();
          },
          error: (err: Error) =>
            this.snack.open(err.message, 'ปิด', { duration: 8000 }),
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
  projectId: number;
}

export interface DeliveryAcceptResult {
  acceptedByContactId: number;
  evidenceNote: string | null;
  isFinal: boolean;
}

type EvidenceMode = 'text' | 'file';

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
    MatIconModule,
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

        <div class="evidence-block">
          <p class="evidence-label">หลักฐานการยอมรับ</p>
          <div class="evidence-modes" role="group" aria-label="รูปแบบหลักฐาน">
            <button
              type="button"
              class="evidence-mode"
              [class.is-active]="evidenceMode() === 'text'"
              (click)="setEvidenceMode('text')"
            >
              <mat-icon>edit_note</mat-icon>
              พิมพ์ข้อความ
            </button>
            <button
              type="button"
              class="evidence-mode"
              [class.is-active]="evidenceMode() === 'file'"
              (click)="setEvidenceMode('file')"
            >
              <mat-icon>attach_file</mat-icon>
              แนบไฟล์
            </button>
          </div>

          @if (evidenceMode() === 'text') {
            <mat-form-field appearance="outline" class="full">
              <mat-label>ข้อความหลักฐาน</mat-label>
              <textarea
                matInput
                rows="3"
                formControlName="evidenceNote"
                placeholder='เช่น ข้อความจากลูกค้า "โอเคค่ะ"'
              ></textarea>
              <mat-hint>ใส่ข้อความ / ลิงก์ยืนยันจากลูกค้า</mat-hint>
            </mat-form-field>
          } @else {
            <label class="file-pick">
              <span>เลือกไฟล์หลักฐาน (ไม่เกิน 20 MB)</span>
              <input type="file" [accept]="accept" (change)="onFilePicked($event)" />
            </label>
            @if (selectedFileName()) {
              <p class="file-name">
                <mat-icon>description</mat-icon>
                {{ selectedFileName() }}
              </p>
            } @else {
              <p class="file-empty">ยังไม่ได้เลือกไฟล์</p>
            }
            <p class="file-hint">ไฟล์จะถูกเก็บในเอกสารของโปรเจคนี้</p>
          }
        </div>

        <label class="final-check">
          <mat-checkbox formControlName="isFinal"></mat-checkbox>
          <span>
            นี่คือการส่งมอบครั้งสุดท้ายของโปรเจค
            <span class="final-hint">ติ๊กเฉพาะเมื่อปิดงานจริง — เฟส/เวอร์ชันทดลองไม่ต้องติ๊ก</span>
          </span>
        </label>

        @if (error()) {
          <p class="error">{{ error() }}</p>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close [disabled]="saving()">ยกเลิก</button>
      <button
        mat-flat-button
        color="primary"
        type="submit"
        form="delivery-accept-form"
        [disabled]="saving()"
      >
        {{ saving() ? 'กำลังบันทึก…' : 'ยืนยันยอมรับ' }}
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
    .evidence-block {
      display: grid;
      gap: 0.55rem;
      margin: 0.15rem 0 0.35rem;
    }
    .evidence-label {
      margin: 0;
      font-size: 0.82rem;
      font-weight: 600;
      color: #334155;
    }
    .evidence-modes {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.5rem;
    }
    .evidence-mode {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.35rem;
      min-height: 2.5rem;
      padding: 0.45rem 0.65rem;
      border: 1px solid #cfe0db;
      border-radius: 10px;
      background: #fff;
      color: #5b6762;
      font: inherit;
      font-size: 0.88rem;
      font-weight: 600;
      cursor: pointer;
    }
    .evidence-mode mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .evidence-mode.is-active {
      border-color: #0f766e;
      background: #ecfdf5;
      color: #0f766e;
      box-shadow: 0 0 0 2px rgba(15, 118, 110, 0.12);
    }
    .file-pick {
      display: grid;
      gap: 0.35rem;
      font-size: 0.88rem;
      color: #334155;
    }
    .file-name {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      margin: 0;
      font-size: 0.88rem;
      color: #0f766e;
      word-break: break-all;
    }
    .file-name mat-icon {
      flex: 0 0 auto;
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .file-empty {
      margin: 0;
      font-size: 0.85rem;
      color: #94a3b8;
    }
    .file-hint {
      margin: 0;
      font-size: 0.78rem;
      color: #64748b;
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
    .error {
      margin: 0.25rem 0 0;
      color: #b91c1c;
      font-size: 0.88rem;
    }
  `,
})
export class DeliveryAcceptDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly docsApi = inject(DocumentService);
  private readonly ref = inject(MatDialogRef<DeliveryAcceptDialogComponent, DeliveryAcceptResult>);
  readonly data = inject<DeliveryAcceptDialogData>(MAT_DIALOG_DATA);

  readonly accept = DOCUMENT_ACCEPT;
  readonly evidenceMode = signal<EvidenceMode>('text');
  readonly selectedFileName = signal('');
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  private evidenceFile: File | null = null;

  readonly form = this.fb.group({
    acceptedByContactId: [
      this.data.delivery.acceptedByContactId ?? (null as number | null),
      Validators.required,
    ],
    evidenceNote: [this.data.delivery.note ?? ''],
    isFinal: [!!this.data.delivery.isFinal],
  });

  setEvidenceMode(mode: EvidenceMode): void {
    this.evidenceMode.set(mode);
    this.error.set(null);
  }

  onFilePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.evidenceFile = file;
    this.selectedFileName.set(file?.name ?? '');
    this.error.set(null);
    if (file && file.size > DOCUMENT_MAX_BYTES) {
      this.evidenceFile = null;
      this.selectedFileName.set('');
      this.error.set('ไฟล์ใหญ่เกิน 20 MB');
      input.value = '';
    }
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const acceptedByContactId = Number(raw.acceptedByContactId);
    const isFinal = !!raw.isFinal;

    if (this.evidenceMode() === 'text') {
      this.ref.close({
        acceptedByContactId,
        evidenceNote: (raw.evidenceNote ?? '').trim() || null,
        isFinal,
      });
      return;
    }

    if (!this.evidenceFile) {
      this.error.set('กรุณาเลือกไฟล์หลักฐาน หรือสลับไปพิมพ์ข้อความ');
      return;
    }
    if (this.evidenceFile.size > DOCUMENT_MAX_BYTES) {
      this.error.set('ไฟล์ใหญ่เกิน 20 MB');
      return;
    }

    const delivery = this.data.delivery;
    const title = `หลักฐานยอมรับ · ${delivery.title}${delivery.version ? ' · ' + delivery.version : ''}`;
    this.saving.set(true);
    this.error.set(null);
    this.docsApi
      .uploadToProject(this.data.projectId, {
        file: this.evidenceFile,
        title,
        note: `อ้างอิงการส่งมอบ #${delivery.id}`,
      })
      .subscribe({
        next: (doc) => {
          this.saving.set(false);
          const fileLabel = doc.fileName || this.evidenceFile?.name || 'ไฟล์';
          this.ref.close({
            acceptedByContactId,
            evidenceNote: `แนบไฟล์: ${fileLabel}`,
            isFinal,
          });
        },
        error: (err: Error) => {
          this.saving.set(false);
          this.error.set(err.message || 'อัปโหลดไฟล์ไม่สำเร็จ');
        },
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
