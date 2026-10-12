import { Location } from '@angular/common';
import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
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
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, switchMap } from 'rxjs/operators';
import {
  DELIVERY_ACCEPTANCE_LABELS,
  Delivery,
  DeliveryAcceptance,
  PRIORITY_LABELS,
  PROJECT_STATUS_LABELS,
  Project,
  ProjectReport,
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
import {
  MaContract,
  ProjectMaQuotaItem,
  maCoverageLabel,
  maPlanDisplayName,
  resolveMaCoverageState,
} from '../../core/models/ma.model';
import {
  ASSIGNMENT_STATUS_LABELS,
  AssignmentStatus,
  Survey,
  SurveyAssignment,
} from '../../core/models/survey.model';
import {
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  Ticket,
} from '../../core/models/ticket.model';
import {
  WARRANTY_STATUS_LABELS,
  Warranty,
  warrantyDisplayLabel,
  warrantyDisplayState,
  warrantyMaLinkLabel,
  warrantyNeedsSignedScan,
} from '../../core/models/warranty.model';
import { Attachment } from '../../core/models/attachment.model';
import { AttachmentService } from '../../core/services/attachment.service';
import { AuthService } from '../../core/services/auth.service';
import { CustomerService } from '../../core/services/customer.service';
import { DocumentService } from '../../core/services/document.service';
import { FollowUpService } from '../../core/services/follow-up.service';
import { NotificationInboxService } from '../../core/services/notification-inbox.service';
import { FollowUpCompleteFlowService } from '../follow-ups/follow-up-complete-dialog.component';
import { ProjectService } from '../../core/services/project.service';
import { QuickActionsService } from '../../core/services/quick-actions.service';
import { SurveyService } from '../../core/services/survey.service';
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
import { UserAvatarComponent } from '../../shared/components/user-avatar.component';
import { TaskEditDialogComponent } from './task-edit-dialog.component';
import { DeliveryPreviewDialogComponent } from './delivery-preview-dialog.component';
import { FilePickerComponent } from '../../shared/components/file-picker.component';
import { PICKER_DEBOUNCE_MS, PICKER_MIN_CHARS } from '../../shared/components/entity-picker.component';
import { RowAction, RowActionsComponent } from '../../shared/components/row-actions.component';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { createClientPager } from '../../shared/utils/client-pager';
import { FORM_DIALOG, FORM_DIALOG_WIDE, FORM_DIALOG_COMPACT } from '../../shared/utils/form-dialog';
import { DocumentPreviewDialogComponent } from '../documents/document-preview-dialog.component';
import { WarrantyFormDialogComponent } from '../warranties/warranties-page.component';
import {
  openWarrantyDocuments,
  printWarranty,
} from '../warranties/warranty-documents-dialog.component';
import { MaFormDialogComponent } from '../ma/ma-page.component';
import { printMaContract } from '../ma/ma-contract-print';
import { MaService } from '../../core/services/ma.service';
import {
  ProjectSurveyDialogComponent,
  ProjectSurveyDialogData,
} from '../surveys/project-survey-dialog.component';
import { ProjectFormDialogComponent } from './projects-page.component';
import {
  FollowUpFormDialogComponent,
  FollowUpFormPreset,
} from '../follow-ups/follow-ups-page.component';
import { ListSkeletonComponent } from '../../shared/components/list-loading.component';
import { openProjectDescription } from './project-description-dialog.component';

type DetailTab =
  | 'deliveries'
  | 'warranties'
  | 'documents'
  | 'tickets'
  | 'followUps'
  | 'ma'
  | 'surveys';

/** แถวตารางเอกสาร — มี warranty = ไฟล์แนบของใบประกัน (ลบ/แก้ที่ใบประกัน) */
type DocumentRow = ApiProjectDocument & { warranty?: Warranty; attachment?: Attachment };

function warrantyFileRow(file: Attachment, warranty: Warranty): DocumentRow {
  return {
    id: file.id,
    title: file.fileName,
    fileName: file.fileName,
    fileSize: file.fileSize ?? 0,
    mimeType: file.mimeType,
    downloadUrl: file.downloadUrl,
    note: file.note,
    uploadedBy: null,
    createdAt: file.createdAt,
    warranty,
    attachment: file,
  };
}

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
    ListSkeletonComponent,
    MatMenuModule,
    RowActionsComponent,
    TablePaginatorComponent,
  ],
  templateUrl: './project-detail-page.component.html',
  styleUrls: ['./project-detail-page.component.scss', './project-detail-summary.mobile.scss'],
})
export class ProjectDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly notificationInbox = inject(NotificationInboxService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly projectsApi = inject(ProjectService);
  private readonly customersApi = inject(CustomerService);
  private readonly documentsApi = inject(DocumentService);
  private readonly followUpsApi = inject(FollowUpService);
  private readonly followUpComplete = inject(FollowUpCompleteFlowService);
  private readonly warrantiesApi = inject(WarrantyService);
  private readonly attachmentsApi = inject(AttachmentService);
  private readonly maApi = inject(MaService);
  private readonly ticketsApi = inject(TicketService);
  private readonly ticketDemoOverlay = inject(TicketDemoOverlayService);
  private readonly quickActions = inject(QuickActionsService);
  private readonly surveysApi = inject(SurveyService);
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
  readonly deliveriesLoading = signal(false);
  readonly deliverySearch = signal('');
  readonly deliverySearchControl = this.fb.nonNullable.control('');
  readonly warrantySearchControl = this.fb.nonNullable.control('');
  readonly warrantySearch = signal('');
  readonly documents = signal<ApiProjectDocument[]>([]);
  readonly documentsLoading = signal(false);
  readonly documentsDenied = signal(false);
  readonly documentSearch = signal('');
  readonly selectedTab = signal(0);
  readonly documentSearchControl = this.fb.nonNullable.control('');
  /** ยังไม่กดหัวคอลัมน์ = ใหม่สุดก่อน */
  readonly documentSortBy = signal<'title' | 'fileName' | 'fileSize' | 'createdAt' | null>(null);
  readonly documentSortOrder = signal<'ASC' | 'DESC'>('DESC');
  /** ไฟล์แนบของใบประกัน (refType WARRANTY) — รวมแสดงในตารางเอกสาร */
  readonly warrantyFiles = signal<{ file: Attachment; warranty: Warranty }[]>([]);
  /**
   * เอกสารโปรเจกต์ + ไฟล์ใบประกัน ในตารางเดียว
   * ค้นหา/เรียง/แบ่งหน้าฝั่ง FE เพราะมาจากสอง API
   */
  readonly documentRows = computed<DocumentRow[]>(() => {
    const rows: DocumentRow[] = [
      ...this.documents(),
      ...this.warrantyFiles().map(({ file, warranty }) => warrantyFileRow(file, warranty)),
    ];
    const q = this.documentSearch().trim().toLowerCase();
    const filtered =
      q.length >= PICKER_MIN_CHARS
        ? rows.filter((r) =>
            [r.title, r.fileName, r.note, r.warranty?.warrantyNo]
              .some((v) => (v ?? '').toLowerCase().includes(q))
          )
        : rows;
    const key = this.documentSortBy() ?? 'createdAt';
    const dir = (this.documentSortBy() ? this.documentSortOrder() : 'DESC') === 'ASC' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (key === 'fileSize') {
        return ((a.fileSize ?? 0) - (b.fileSize ?? 0)) * dir;
      }
      const av = key === 'title' ? this.documentTitle(a) : (a[key] ?? '');
      const bv = key === 'title' ? this.documentTitle(b) : (b[key] ?? '');
      return av.localeCompare(bv, 'th') * dir;
    });
  });
  readonly documentsPager = createClientPager(this.documentRows);
  readonly followUps = signal<FollowUp[]>([]);
  readonly followUpsLoading = signal(false);
  readonly followUpSearch = signal('');
  readonly followUpSearchControl = this.fb.nonNullable.control('');
  /** ประกันที่ออกแล้วของโปรเจกต์นี้ — แสดงในแท็บส่งมอบ */
  readonly warranties = signal<Warranty[]>([]);
  /** ใบแจ้งปัญหาของโปรเจกต์นี้ */
  readonly projectTickets = signal<Ticket[]>([]);
  readonly ticketsLoading = signal(false);
  readonly ticketsLoadError = signal<string | null>(null);
  readonly ticketSearch = signal('');
  readonly ticketSearchControl = this.fb.nonNullable.control('');
  /** GET /projects/:id/ma-quota — สัญญา + โควตา (ประเภทเดียว) ของโปรเจกต์ */
  readonly maQuotaItems = signal<ProjectMaQuotaItem[]>([]);
  readonly maQuotaLoading = signal(false);
  /** แบบประเมินที่ส่งของโปรเจกต์นี้ (กรองจาก assignments ทุกแบบ) */
  readonly projectSurveyRows = signal<ProjectSurveyRow[]>([]);
  readonly projectSurveysLoading = signal(false);
  readonly assignmentStatusLabels = ASSIGNMENT_STATUS_LABELS;
  /** สรุปตัวเลขจาก GET /projects/:id/report — ไม่ประกอบเองจากแท็บ */
  readonly projectReport = signal<ProjectReport | null>(null);
  readonly statusLabels = PROJECT_STATUS_LABELS;
  readonly projectPriorityLabels = PRIORITY_LABELS;
  readonly taskStatusLabels = TASK_STATUS_LABELS;
  readonly taskStatuses = TASK_STATUSES;
  readonly priorityLabels = TASK_PRIORITY_LABELS;
  readonly priorities = TASK_PRIORITIES;
  readonly warrantyStatusLabels = WARRANTY_STATUS_LABELS;
  readonly ticketStatusLabels = TICKET_STATUS_LABELS;
  readonly ticketPriorityLabels = TICKET_PRIORITY_LABELS;
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
  readonly warrantyColumns = [
    'warrantyNo',
    'delivery',
    'period',
    'daysLeft',
    'maLink',
    'status',
    'actions',
  ];
  readonly warrantyMaLinkLabel = warrantyMaLinkLabel;
  readonly ticketColumns = ['ticketNo', 'title', 'status', 'priority', 'reportedAt', 'actions'];
  readonly maColumns = ['contractNo', 'plan', 'coverage', 'quota', 'quotaPeriod', 'actions'];
  readonly surveyColumns = ['survey', 'status', 'sentAt', 'answeredAt', 'actions'];
  readonly documentColumns = ['title', 'fileSize', 'uploadedBy', 'createdAt', 'actions'];

  /** ซ่อนแท็บ/ยิง API ตามสิทธิ์จริงจาก /auth/me */
  readonly canViewProject = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('project.view');
  });
  readonly canViewTasks = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('task.view');
  });
  readonly openTaskCount = computed(() => {
    const progress = this.project()?.progress;
    if (!progress) {
      return 0;
    }
    return Math.max(0, (progress.totalTasks ?? 0) - (progress.doneTasks ?? 0));
  });
  readonly overdueTaskCount = computed(() => this.project()?.progress?.overdueTasks ?? 0);
  readonly openTaskHint = computed(() => {
    const open = this.openTaskCount();
    if (!open) {
      return null;
    }
    const overdue = this.overdueTaskCount();
    return overdue
      ? `ยังมีงานไม่เสร็จ ${open} งาน (เกินกำหนด ${overdue})`
      : `ยังมีงานไม่เสร็จ ${open} งาน`;
  });
  readonly canCreateTask = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('task.create');
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
   * - ส่งมอบแล้ว → ปิดโปรเจกต์ (ถึงขั้นนี้ได้ก็ต่อเมื่อ BE ยอมรับรอบสุดท้ายแล้ว)
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
          ? 'ลูกค้ายอมรับการส่งมอบรอบสุดท้ายแล้ว'
          : 'ลูกค้ายังไม่ได้ยอมรับการส่งมอบรอบสุดท้าย',
      },
    ];
    if (this.canViewWarranties()) {
      items.push({
        id: 'warranty',
        ok: issuedWarranty || canIssue,
        label: issuedWarranty
          ? 'มีประกันแล้ว'
          : canIssue
            ? 'พร้อมออกประกัน'
            : 'ยังออกประกันไม่ได้',
      });
    }
    return items;
  });
  /**
   * แถบขั้นถัดไปในแท็บส่งมอบ — โชว์เฉพาะตอนยังมีสิ่งที่ต้องทำ
   * (ไม่โชว์เช็คลิสต์ครบแล้ว / โปรเจกต์ปิด — รบกวนตอนเข้ามาดู)
   */
  readonly deliveryNextHint = computed(() => {
    const status = this.project()?.status;
    if (!status || status === 'CLOSED' || status === 'CANCELLED') {
      return null;
    }

    const items = this.deliveryReadiness();
    const blockers = items.filter((i) => !i.ok).map((i) => i.label);

    if (status === 'DRAFT') {
      // ปุ่มเริ่มอยู่ที่หัวหน้า「เริ่มงาน」แล้ว — แถบนี้แค่บอกเหตุผล ไม่ซ้ำปุ่ม
      return {
        title: 'โปรเจกต์ยังเป็นร่าง',
        detail:
          'กด「เริ่มงาน」ด้านบนก่อน จึงจะบันทึกส่งมอบและออกประกันได้',
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
  readonly canCreateMa = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('ma.create');
  });
  readonly canUpdateMa = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('ma.update');
  });
  readonly canViewSurvey = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('survey.view');
  });
  readonly canSendSurvey = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('survey.send');
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
      const deliveredBy = this.deliveredByName(d).toLowerCase();
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
        (w.warrantyNo ?? '').toLowerCase().includes(q) ||
        (w.delivery?.title ?? '').toLowerCase().includes(q) ||
        warrantyDisplayLabel(w).toLowerCase().includes(q) ||
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
  readonly maQuotaPager = createClientPager(this.maQuotaItems);
  readonly projectSurveysPager = createClientPager(this.projectSurveyRows);

  private projectId = 0;

  /** ใช้ส่งเข้า kanban / ลิงก์ */
  get currentProjectId(): number {
    return this.projectId;
  }

  goBack(): void {
    navigateBack(this.location, this.router, '/app/projects');
  }

  /** ลิงก์จากรายละเอียดงาน — เปิดแท็บเอกสาร และใส่คำค้นถ้ามี */
  private openDocumentsTab(tab: string | null, search: string | null): void {
    if (tab !== 'documents' || !this.canViewDocuments()) {
      return;
    }
    const q = (search ?? '').trim();
    const next = q.length >= PICKER_MIN_CHARS ? q : '';
    this.documentSearch.set(next);
    this.documentSearchControl.setValue(next, { emitEvent: false });
    this.documentsPager.reset();
    this.queueDocumentsTab();
  }

  /** แท็บถูกสร้างหลังโปรเจกต์โหลด — ตั้ง index อีกรอบหลัง MatTabGroup init */
  private queueDocumentsTab(): void {
    if (!this.canViewDocuments()) {
      return;
    }
    const index = this.documentsTabIndex();
    this.selectedTab.set(index);
    setTimeout(() => {
      if (this.route.snapshot.queryParamMap.get('tab') === 'documents') {
        this.selectedTab.set(index);
      }
    });
  }

  private documentsTabIndex(): number {
    let index = 0;
    if (this.canViewDeliveries()) {
      index += 1;
    }
    if (this.canViewWarranties()) {
      index += 1;
    }
    return index;
  }

  /** ลำดับต้องตรงกับ mat-tab ใน template (แท็บที่ไม่มีสิทธิ์ไม่ถูกสร้าง) */
  private readonly tabKeys = computed<DetailTab[]>(() => {
    const keys: DetailTab[] = [];
    if (this.canViewDeliveries()) keys.push('deliveries');
    if (this.canViewWarranties()) keys.push('warranties');
    if (this.canViewDocuments()) keys.push('documents');
    if (this.canViewTickets()) keys.push('tickets');
    keys.push('followUps');
    if (this.canViewMa()) keys.push('ma');
    if (this.canViewSurvey()) keys.push('surveys');
    return keys;
  });
  /** แท็บที่โหลดข้อมูลแล้ว — refresh() โหลดซ้ำเฉพาะแท็บเหล่านี้ */
  private readonly loadedTabs = new Set<DetailTab>();
  private readonly lazyTabs = effect(() => {
    if (!this.project()) {
      return;
    }
    const key = this.tabKeys()[this.selectedTab()];
    untracked(() => {
      if (key && !this.loadedTabs.has(key)) {
        this.loadTab(key);
      }
    });
  });

  /** ส่งมอบ + ประกันใช้ข้อมูลร่วมกัน (checklist / ปุ่มออกประกัน) — โหลดคู่กันเสมอ */
  private loadTab(key: DetailTab): void {
    this.loadedTabs.add(key);
    switch (key) {
      case 'deliveries':
      case 'warranties':
        this.loadedTabs.add('deliveries').add('warranties');
        this.loadDeliveries();
        this.loadWarranties();
        break;
      case 'documents':
        this.loadDocuments();
        this.loadWarrantyFiles();
        break;
      case 'tickets':
        this.loadProjectTickets();
        break;
      case 'followUps':
        this.loadFollowUps();
        break;
      case 'ma':
        this.loadProjectMaQuota();
        break;
      case 'surveys':
        this.loadProjectSurveys();
        break;
    }
  }

  ngOnInit(): void {
    this.projectId = Number(this.route.snapshot.paramMap.get('id'));
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.openDocumentsTab(params.get('tab'), params.get('search'));
    });
    this.usersApi.loadForPicker(this.auth.currentUser(), { capability: 'TASK' }).subscribe();
    this.projectsApi.fetchProject(this.projectId).subscribe({
      next: (project) => {
        this.project.set(project);
        this.notFound.set(false);
        this.notificationInbox.markReadByRef('PROJECT', project.id);
        this.customersApi.fetchCustomer(project.customerId).subscribe();
        this.customersApi.listContacts(project.customerId).subscribe();
        this.refresh({ skipProject: true });
        if (this.route.snapshot.queryParamMap.get('tab') === 'documents') {
          this.queueDocumentsTab();
        }
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
      .pipe(
        debounceTime(PICKER_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((v) => {
        this.documentSearch.set(v);
        this.documentsPager.reset();
      });
  }

  customerName(): string {
    const project = this.project();
    const fromProject = project?.customer?.name?.trim();
    if (fromProject) {
      return fromProject;
    }
    const id = project?.customerId;
    if (!id) {
      return '—';
    }
    return this.customersApi.getCustomer(id)?.name?.trim() || '—';
  }

  /** ซ่อนค่าว่าง / ตัวเลขเดี่ยวที่มักใส่ผิด เช่น "0" */
  isLongDescription(text: string): boolean {
    return text.length > 90 || text.includes('\n');
  }

  openDescription(p: Project, text: string): void {
    openProjectDescription(this.dialog, {
      name: p.name,
      code: p.code,
      customerName: p.customerId ? this.customerName() : null,
      status: p.status,
      statusLabel: this.projectStatusLabel(p.status),
      priority: p.priority,
      priorityLabel: this.projectPriorityLabel(p.priority),
      description: text,
    });
  }

  projectDescription(project: Project): string | null {
    const text = project.description?.trim() ?? '';
    if (!text || text === '0' || text === '-' || text === '—') {
      return null;
    }
    return text;
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

  deliveredByName(d: Delivery): string {
    return d.deliveredByUser?.fullName?.trim() || this.userName(d.deliveredByUserId);
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
      customerId: project.customerId,
      customerName: project.customer?.name ?? null,
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
      this.snack.open('ไม่มีสิทธิ์แก้ไขโปรเจกต์', 'ปิด', { duration: 3000 });
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
          'ปิดโปรเจกต์ได้เมื่อมีการส่งมอบครั้งสุดท้ายที่ลูกค้ายอมรับแล้ว',
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
        this.snack.open('ต้องเป็นสถานะ「ส่งมอบแล้ว」ก่อนปิดโปรเจกต์', 'ปิด', {
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

  /** ไม่มีการลบโปรเจกต์ — ยกเลิกด้วยสถานะ CANCELLED (PUT /projects/:id) */
  cancelProject(): void {
    const project = this.project();
    if (!project || !this.canUpdateProject()) {
      this.snack.open('ไม่มีสิทธิ์แก้ไขโปรเจกต์', 'ปิด', { duration: 3000 });
      return;
    }
    openConfirmDialog(this.dialog, {
      title: 'ยกเลิกโปรเจกต์',
      message: `ต้องการยกเลิกโปรเจกต์「${project.name}」หรือไม่?\nข้อมูลยังอยู่ครบ แค่เปลี่ยนสถานะเป็น「ยกเลิก」`,
      confirmLabel: 'ยกเลิกโปรเจกต์',
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.projectsApi.updateProject(project.id, { status: 'CANCELLED' }).subscribe({
        next: () => {
          this.snack.open('ยกเลิกโปรเจกต์แล้ว', 'ปิด', { duration: 2500 });
          this.refresh();
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

  /** สิทธิ์เดียวกับหน้ารายละเอียด — project.view · ตัวเลขจากเส้นนี้เท่านั้น */
  private loadProjectReport(): void {
    if (!this.canViewProject()) {
      this.projectReport.set(null);
      this.progress.set(null);
      return;
    }
    this.projectsApi.getProjectReport(this.projectId).subscribe({
      next: (report) => {
        this.projectReport.set(report);
        this.progress.set(report.progress.percent);
      },
      error: () => {
        this.projectReport.set(null);
        this.progress.set(null);
      },
    });
  }

  /** หัวหน้า + รายงาน + งาน โหลดทันที · ข้อมูลแท็บโหลดเมื่อเปิดแท็บครั้งแรก */
  refresh(opts: { skipProject?: boolean } = {}): void {
    if (!opts.skipProject) {
      this.projectsApi.fetchProject(this.projectId).subscribe({
        next: (project) => this.project.set(project),
        error: () => undefined,
      });
    }
    this.loadProjectReport();

    if (this.canViewTasks()) {
      this.tasksDenied.set(false);
      this.projectsApi.listTasks(this.projectId, undefined, { optional: true }).subscribe({
        next: (tasks) => this.tasks.set(tasks),
        error: () => {
          this.tasks.set([]);
          this.tasksDenied.set(true);
        },
      });
    } else {
      this.tasks.set([]);
      this.tasksDenied.set(false);
    }

    for (const key of [...this.loadedTabs]) {
      if (key !== 'warranties') {
        this.loadTab(key);
      }
    }
  }

  private loadDeliveries(): void {
    if (!this.canViewDeliveries()) {
      this.deliveries.set([]);
      this.deliveriesDenied.set(false);
      return;
    }
    this.deliveriesDenied.set(false);
    this.deliveriesLoading.set(true);
    this.projectsApi.listDeliveries(this.projectId, { optional: true }).subscribe({
      next: (rows) => {
        this.deliveries.set(rows);
        this.deliveriesLoading.set(false);
      },
      error: () => {
        this.deliveries.set([]);
        this.deliveriesDenied.set(true);
        this.deliveriesLoading.set(false);
      },
    });
  }

  private loadFollowUps(): void {
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
  }

  /** ประกันที่ออกจากการส่งมอบของโปรเจกต์นี้ */
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

  /** สัญญา + โควตา MA ของโปรเจกต์ — เรียกเฉพาะเมื่อมี ma.view (เลี่ยง 403) */
  private loadProjectMaQuota(): void {
    if (!this.canViewMa()) {
      this.maQuotaItems.set([]);
      this.maQuotaLoading.set(false);
      return;
    }
    this.maQuotaLoading.set(true);
    this.projectsApi.getProjectMaQuota(this.projectId).subscribe({
      next: (body) => {
        this.maQuotaItems.set(body.items);
        this.maQuotaPager.reset();
        this.maQuotaLoading.set(false);
      },
      error: () => {
        this.maQuotaItems.set([]);
        this.maQuotaPager.reset();
        this.maQuotaLoading.set(false);
      },
    });
  }

  maPlanName(contract: MaContract): string {
    return maPlanDisplayName(contract);
  }

  maCoverageLabelOf(contract: MaContract): string {
    return maCoverageLabel(contract);
  }

  maCoverageStateOf(contract: MaContract): string {
    return resolveMaCoverageState(contract);
  }

  /** สร้างสัญญา MA ของโปรเจกต์นี้ */
  openCreateMa(): void {
    const project = this.project();
    if (!project) {
      return;
    }
    if (!this.canCreateMa()) {
      this.snack.open('ไม่มีสิทธิ์สร้างสัญญา MA', 'ปิด', { duration: 3000 });
      return;
    }
    const ref = this.dialog.open(MaFormDialogComponent, {
      ...FORM_DIALOG_WIDE,
      data: { projectId: project.id, customerId: project.customerId },
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.loadProjectMaQuota();
        this.loadProjectReport();
      }
    });
  }

  /** แก้ไขสัญญา MA จากแถวในโปรเจกต์ */
  openEditMa(contract: MaContract): void {
    if (!this.canUpdateMa()) {
      this.snack.open('ไม่มีสิทธิ์แก้ไขสัญญา MA', 'ปิด', { duration: 3000 });
      return;
    }
    const ref = this.dialog.open(MaFormDialogComponent, {
      ...FORM_DIALOG_WIDE,
      data: contract,
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.loadProjectMaQuota();
        this.loadProjectReport();
      }
    });
  }

  maRowActions(row: ProjectMaQuotaItem): RowAction[] {
    const actions: RowAction[] = [
      {
        label: 'รายละเอียด',
        primary: true,
        icon: 'visibility',
        run: () => void this.router.navigate(['/app/ma', row.contract.id]),
      },
      {
        label: 'พิมพ์สัญญา',
        icon: 'print',
        run: () => printMaContract(this.maApi, this.snack, row.contract.id),
      },
    ];
    if (this.canUpdateMa()) {
      actions.push({
        label: 'แก้ไข',
        icon: 'edit',
        run: () => this.openEditMa(row.contract),
      });
    }
    return actions;
  }

  /** โหลดการส่งแบบประเมินของโปรเจกต์ — รวมจากทุกแบบแล้วกรอง projectId */
  private loadProjectSurveys(): void {
    if (!this.canViewSurvey()) {
      this.projectSurveyRows.set([]);
      this.projectSurveysLoading.set(false);
      return;
    }
    this.projectSurveysLoading.set(true);
    this.surveysApi.list({ limit: 100 }).subscribe({
      next: (surveys) => {
        if (!surveys.length) {
          this.projectSurveyRows.set([]);
          this.projectSurveysPager.reset();
          this.projectSurveysLoading.set(false);
          return;
        }
        forkJoin(
          surveys.map((survey) =>
            this.surveysApi.listAssignments(survey.id).pipe(
              map((rows) =>
                rows
                  .filter((a) => a.projectId === this.projectId)
                  .map(
                    (assignment): ProjectSurveyRow => ({
                      assignment,
                      surveyId: survey.id,
                      surveyTitle: survey.title,
                      survey,
                    })
                  )
              ),
              catchError(() => of([] as ProjectSurveyRow[]))
            )
          )
        ).subscribe({
          next: (chunks) => {
            const rows = chunks.flat().sort((a, b) => {
              const aAt = a.assignment.sentAt ?? a.assignment.createdAt;
              const bAt = b.assignment.sentAt ?? b.assignment.createdAt;
              return new Date(bAt).getTime() - new Date(aAt).getTime();
            });
            this.projectSurveyRows.set(rows);
            this.projectSurveysPager.reset();
            this.projectSurveysLoading.set(false);
          },
          error: () => {
            this.projectSurveyRows.set([]);
            this.projectSurveysPager.reset();
            this.projectSurveysLoading.set(false);
          },
        });
      },
      error: () => {
        this.projectSurveyRows.set([]);
        this.projectSurveysPager.reset();
        this.projectSurveysLoading.set(false);
      },
    });
  }

  assignmentStatusLabel(status: AssignmentStatus): string {
    return this.assignmentStatusLabels[status] ?? status;
  }

  openSendSurvey(): void {
    const project = this.project();
    if (!project) {
      return;
    }
    if (!this.canSendSurvey()) {
      this.snack.open('ไม่มีสิทธิ์ส่งแบบประเมิน', 'ปิด', { duration: 3000 });
      return;
    }
    const data: ProjectSurveyDialogData = {
      projectId: project.id,
      customerId: project.customerId,
      contacts: this.contacts(),
    };
    this.dialog
      .open(ProjectSurveyDialogComponent, {
        ...FORM_DIALOG,
        data,
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.loadProjectSurveys();
        }
      });
  }

  openAnswerSurvey(row: ProjectSurveyRow): void {
    const project = this.project();
    if (!project) {
      return;
    }
    if (!this.canSendSurvey()) {
      this.snack.open('ไม่มีสิทธิ์บันทึกคำตอบแบบประเมิน', 'ปิด', { duration: 3000 });
      return;
    }
    const openWith = (survey: Survey) => {
      const data: ProjectSurveyDialogData = {
        projectId: project.id,
        customerId: project.customerId,
        contacts: this.contacts(),
        assignment: row.assignment,
        survey,
      };
      this.dialog
        .open(ProjectSurveyDialogComponent, {
          ...FORM_DIALOG,
          data,
        })
        .afterClosed()
        .subscribe((saved) => {
          if (saved) {
            this.loadProjectSurveys();
          }
        });
    };
    if (row.survey?.questions?.length) {
      openWith(row.survey);
      return;
    }
    this.surveysApi.get(row.surveyId).subscribe({
      next: openWith,
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 4000 }),
    });
  }

  surveyRowActions(row: ProjectSurveyRow): RowAction[] {
    const actions: RowAction[] = [
      {
        label: 'ดูแบบประเมิน',
        primary: true,
        icon: 'visibility',
        run: () => void this.router.navigate(['/app/surveys', row.surveyId]),
      },
    ];
    if (this.canSendSurvey() && row.assignment.status === 'SENT') {
      actions.push({
        label: 'บันทึกคำตอบ',
        icon: 'edit_note',
        run: () => this.openAnswerSurvey(row),
      });
    }
    return actions;
  }

  /* ——— ป้ายชื่อสำหรับตาราง (แถวจาก mat-table เป็น any) ——— */

  warrantyStatusLabel(status: Warranty['status']): string {
    return this.warrantyStatusLabels[status] ?? status;
  }

  ticketStatusLabel(status: Ticket['status']): string {
    return this.ticketStatusLabels[status] ?? status;
  }

  /** สถานะของใบจาก ticket.status — ไม่ใช่ผลของรอบแก้ (result) */
  ticketStatusLabelFor(ticket: Ticket): string {
    return this.ticketStatusLabels[ticket.status] ?? ticket.status;
  }

  ticketStatusAttr(ticket: Ticket): string {
    return ticket.status;
  }

  ticketPriorityLabel(priority: Ticket['priority']): string {
    return this.ticketPriorityLabels[priority] ?? priority;
  }

  /** เปิดใบแจ้งปัญหาของโปรเจกต์นี้ — ไม่ต้องเด้งไปเมนูปัญหา */
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
      this.documentsDenied.set(false);
      this.documentsLoading.set(false);
      return;
    }
    this.documentsLoading.set(true);
    this.documentsDenied.set(false);
    this.fetchAllProjectDocuments().subscribe({
      next: (items) => {
        this.documents.set(items);
        this.documentsLoading.set(false);
      },
      error: (err: Error) => {
        this.documents.set([]);
        this.documentsLoading.set(false);
        this.snack.open(err.message, 'ปิด', { duration: 5000 });
      },
    });
  }

  /** ดึงครบทุกหน้า — ตารางรวมกับไฟล์ใบประกันจึงต้องมีข้อมูลทั้งหมดฝั่ง FE */
  private fetchAllProjectDocuments(): Observable<ApiProjectDocument[]> {
    const limit = 100;
    return this.documentsApi.listByProject(this.projectId, { page: 1, limit }).pipe(
      switchMap(({ items, total }) => {
        const pages = Math.ceil(total / limit);
        if (pages <= 1) {
          return of(items);
        }
        return forkJoin(
          Array.from({ length: pages - 1 }, (_, i) =>
            this.documentsApi
              .listByProject(this.projectId, { page: i + 2, limit })
              .pipe(map((res) => res.items))
          )
        ).pipe(map((rest) => items.concat(...rest)));
      })
    );
  }

  loadWarrantyFiles(): void {
    if (!this.canViewWarranties()) {
      this.warrantyFiles.set([]);
      return;
    }
    this.warrantiesApi
      .listByProject(this.projectId)
      .pipe(
        switchMap((warranties) => {
          const withFiles = warranties.filter((w) => w.attachmentCount !== 0);
          if (withFiles.length === 0) {
            return of([]);
          }
          return forkJoin(
            withFiles.map((warranty) =>
              this.attachmentsApi.list({ refType: 'WARRANTY', refId: warranty.id }).pipe(
                map((files) => files.map((file) => ({ file, warranty }))),
                catchError(() => of([]))
              )
            )
          ).pipe(map((groups) => groups.flat()));
        })
      )
      .subscribe({
        next: (rows) => this.warrantyFiles.set(rows),
        error: () => this.warrantyFiles.set([]),
      });
  }

  warrantyCode(w: Warranty): string {
    return w.warrantyNo?.trim() || `#${w.id}`;
  }

  toggleDocumentSort(key: 'title' | 'fileName' | 'fileSize' | 'createdAt'): void {
    if (this.documentSortBy() === key) {
      this.documentSortOrder.update((dir) => (dir === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      this.documentSortBy.set(key);
      this.documentSortOrder.set(key === 'createdAt' || key === 'fileSize' ? 'DESC' : 'ASC');
    }
    this.documentsPager.reset();
  }

  documentSortIcon(key: 'title' | 'fileName' | 'fileSize' | 'createdAt'): string {
    if (this.documentSortBy() !== key) {
      return 'unfold_more';
    }
    return this.documentSortOrder() === 'ASC' ? 'arrow_upward' : 'arrow_downward';
  }

  documentTitle(row: ApiProjectDocument): string {
    return row.title?.trim() || row.fileName;
  }

  /** ชื่อไฟล์เป็นบรรทัดรอง เมื่อคนละค่ากับชื่อเอกสาร */
  documentFileName(row: ApiProjectDocument): string | null {
    const title = row.title?.trim();
    const fileName = row.fileName?.trim();
    if (!fileName || !title || fileName === title) {
      return null;
    }
    return fileName;
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
        this.documentsPager.reset();
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
          'โปรเจกต์ยังเป็นร่าง — กด「เริ่มงาน」ก่อนจึงบันทึกการส่งมอบได้',
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
    const me = this.auth.currentUser();
    const ref = this.dialog.open(DeliveryFormDialogComponent, {
      ...FORM_DIALOG,
      data: {
        projectId: this.projectId,
        users: this.users(),
        contacts: this.contacts(),
        deliveredBy: me
          ? { id: me.id, fullName: me.fullName, avatarUrl: me.avatarUrl ?? null }
          : null,
      },
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.refresh();
      }
    });
  }

  deliveryRowActions(row: Delivery): RowAction[] {
    const actions: RowAction[] = [
      { label: 'รายละเอียด', primary: true, icon: 'visibility', run: () => this.openDeliveryDetail(row) },
    ];
    actions.push({
      label: 'ออกประกัน',
      icon: 'verified',
      disabled: !row.canIssueWarranty,
      run: () => this.openIssueWarranty(row),
    });
    return actions;
  }

  warrantyNeedsSignedScan(row: Warranty): boolean {
    return warrantyNeedsSignedScan(row);
  }

  openWarrantyDocuments(row: Warranty): void {
    openWarrantyDocuments(this.dialog, row, () => {
      this.loadWarranties();
      if (this.loadedTabs.has('documents')) {
        this.loadWarrantyFiles();
      }
    });
  }

  warrantyRowActions(row: Warranty): RowAction[] {
    const actions: RowAction[] = [
      {
        label: 'ดู / แนบเอกสาร',
        primary: true,
        icon: 'attach_file',
        run: () => this.openWarrantyDocuments(row),
      },
      {
        label: 'พิมพ์ใบรับประกัน',
        icon: 'print',
        run: () => printWarranty(this.warrantiesApi, this.snack, row.id),
      },
    ];
    if (this.auth.hasPermissionCode('warranty.update')) {
      actions.push({
        label: 'แก้ไข',
        icon: 'edit',
        run: () =>
          this.dialog
            .open(WarrantyFormDialogComponent, { ...FORM_DIALOG, data: row })
            .afterClosed()
            .subscribe((saved) => {
              if (saved) {
                this.loadWarranties();
              }
            }),
      });
    }
    return actions;
  }

  warrantyDisplayLabel(row: Warranty): string {
    return warrantyDisplayLabel(row);
  }

  warrantyDisplayState(row: Warranty): string {
    return warrantyDisplayState(row);
  }

  /**
   * เปิดฟอร์มออกประกันทุกครั้ง แม้ใบส่งมอบนี้มีประกันแล้ว (ออกได้หลายใบถ้าระยะต่างกัน)
   * ระยะซ้ำกับใบเดิมที่ยังไม่ VOID → backend ตอบ 409 ข้อความไทย ฟอร์มแสดงตรง ๆ
   */
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
        deliveredAt: delivery.deliveredAt,
      },
    });
    warrantyRef.afterClosed().subscribe((saved) => {
      if (saved) {
        this.snack.open('ออกประกันแล้ว', 'ปิด', { duration: 2500 });
        this.refresh();
      }
    });
  }

  documentRowActions(row: DocumentRow): RowAction[] {
    const actions: RowAction[] = [
      { label: 'ดูรายละเอียด', primary: true, icon: 'visibility', run: () => this.openDocumentPreview(row) },
    ];
    const { warranty, attachment } = row;
    if (warranty && attachment) {
      actions.push(
        {
          label: 'ดาวน์โหลด',
          icon: 'download',
          run: () =>
            this.attachmentsApi.download(attachment).subscribe({
              error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 5000 }),
            }),
        },
        { label: 'เปิดใบประกัน', icon: 'verified_user', run: () => this.openWarrantyDocuments(warranty) }
      );
      return actions;
    }
    if (this.canUpdateDocument()) {
      actions.push({ label: 'แก้ไข', icon: 'edit', run: () => this.openEditDocument(row) });
    }
    if (this.canDeleteDocument()) {
      actions.push({ label: 'ลบ', icon: 'delete', danger: true, run: () => this.removeDocument(row) });
    }
    return actions;
  }

  projectTicketRowActions(row: Ticket): RowAction[] {
    const actions: RowAction[] = [
      {
        label: 'รายละเอียด',
        primary: true,
        icon: 'open_in_new',
        run: () => void this.router.navigate(['/app/tickets', row.id]),
      },
    ];
    if (this.canCloseTicket() && this.ticketStatusAttr(row) === 'RESOLVED') {
      actions.push({ label: 'ปิดงาน', icon: 'task_alt', run: () => this.closeProjectTicket(row) });
    }
    return actions;
  }

  projectFollowUpRowActions(row: FollowUp): RowAction[] {
    const actions: RowAction[] = [
      { label: 'รายละเอียด', icon: 'visibility', run: () => this.openFollowUpDetail(row) },
    ];
    if (this.followUpComplete.canCompleteRow(row)) {
      actions.unshift({ label: 'เสร็จแล้ว', primary: true, icon: 'task_alt', run: () => this.completeFollowUp(row) });
    } else {
      actions[0].primary = true;
    }
    return actions;
  }

  completeFollowUp(row: FollowUp): void {
    this.followUpComplete.open(row).subscribe((result) => {
      if (result) {
        this.loadFollowUps();
      }
    });
  }

  openDeliveryDetail(d: Delivery): void {
    this.dialog.open(DeliveryPreviewDialogComponent, {
      ...FORM_DIALOG_COMPACT,
      data: {
        delivery: d,
        deliveredByName: this.deliveredByName(d),
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
                ? 'ยอมรับรอบสุดท้ายแล้ว — ระบบจะเปลี่ยนสถานะโปรเจกต์เป็น「ส่งมอบแล้ว」'
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
}

/* ——— Add delivery dialog ——— */

export interface ProjectSurveyRow {
  assignment: SurveyAssignment;
  surveyId: number;
  surveyTitle: string;
  survey: Survey | null;
}

export interface DeliveryFormDialogData {
  projectId: number;
  users: User[];
  contacts: Contact[];
  deliveredBy: { id: number; fullName: string; avatarUrl: string | null } | null;
}

@Component({
  selector: 'app-delivery-form-dialog',
  standalone: true,
  imports: [
    UserAvatarComponent,
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
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>หัวข้อการส่งมอบ</mat-label>
          <input matInput formControlName="title" placeholder="เช่น ส่งมอบรอบที่ 1" />
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>เวอร์ชัน</mat-label>
          <input matInput formControlName="version" placeholder="เช่น v1.0" />
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>วันที่ส่ง</mat-label>
          <input
            matInput
            [matDatepicker]="deliveryPicker"
            formControlName="deliveredDate"
            readonly
            (click)="deliveryPicker.open()"
          />
          <mat-datepicker-toggle matIconSuffix [for]="deliveryPicker"></mat-datepicker-toggle>
          <mat-datepicker #deliveryPicker></mat-datepicker>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>เวลาที่ส่ง</mat-label>
          <input matInput appThaiTimeInput formControlName="deliveredTime" />
          <span matTextSuffix>น.</span>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="delivered-by">
          <mat-label>ผู้ส่งมอบ</mat-label>
          <span matPrefix class="delivered-by__avatar">
            <app-user-avatar [url]="data.deliveredBy?.avatarUrl" [name]="data.deliveredBy?.fullName" [size]="24" />
          </span>
          <input matInput readonly tabindex="-1" [value]="data.deliveredBy?.fullName || '—'" />
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>ผู้รับมอบ (ฝั่งลูกค้า)</mat-label>
          <mat-select formControlName="acceptedByContactId">
            <mat-option [value]="null">—</mat-option>
            @for (c of data.contacts; track c.id) {
              <mat-option [value]="c.id">{{ c.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>รายละเอียด</mat-label>
          <textarea matInput rows="2" formControlName="description"></textarea>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
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
      grid-template-columns: 1fr 1fr;
      gap: 0.65rem 0.85rem;
      align-items: start;
      padding-top: 0.15rem;
    }
    mat-form-field {
      width: 100%;
    }
    .delivered-by__avatar {
      display: inline-flex;
      align-items: center;
      padding: 0 0.35rem 0 0.75rem;
    }
    .delivered-by input {
      cursor: default;
    }
    textarea {
      resize: none;
      min-height: 2.4rem;
    }
    @media (max-width: 720px) {
      .dlg-form {
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
        deliveredByUserId: this.data.deliveredBy?.id ?? null,
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
    FilePickerComponent,
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
            </mat-form-field>
          } @else {
            <app-file-picker
              label="เลือกไฟล์หลักฐาน"
              hint="ไม่เกิน 20 MB · เก็บในเอกสารของโปรเจกต์นี้"
              [accept]="accept"
              [fileName]="selectedFileName()"
              (picked)="onFilePicked($event)"
            />
          }
        </div>

        <label class="final-check">
          <mat-checkbox formControlName="isFinal"></mat-checkbox>
          <span>
            นี่คือการส่งมอบครั้งสุดท้ายของโปรเจกต์
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
      color: var(--app-text-soft);
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
      color: var(--app-text-soft);
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
      border: 1px solid var(--app-control-line);
      border-radius: 10px;
      background: var(--app-surface);
      color: var(--app-muted);
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
      border-color: var(--app-accent);
      background: var(--app-accent-soft);
      color: var(--app-accent);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--app-accent) 12%, transparent);
    }
    .file-pick {
      display: grid;
      gap: 0.35rem;
      font-size: 0.88rem;
      color: var(--app-text-soft);
    }
    .file-name {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      margin: 0;
      font-size: 0.88rem;
      color: var(--app-accent);
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
      color: var(--app-subtle);
    }
    .file-hint {
      margin: 0;
      font-size: 0.78rem;
      color: var(--app-muted);
    }
    .final-check {
      display: flex;
      align-items: flex-start;
      gap: 0.35rem;
      margin: 0.5rem 0 0.25rem;
      cursor: pointer;
      font-size: 0.9rem;
      color: var(--app-ink);
      line-height: 1.4;
    }
    .final-hint {
      display: block;
      margin-top: 0.2rem;
      font-size: 0.78rem;
      color: var(--app-muted);
      font-weight: 400;
    }
    .error {
      margin: 0.25rem 0 0;
      color: var(--app-danger);
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

  onFilePicked(file: File | null): void {
    this.evidenceFile = file;
    this.selectedFileName.set(file?.name ?? '');
    this.error.set(null);
    if (file && file.size > DOCUMENT_MAX_BYTES) {
      this.evidenceFile = null;
      this.selectedFileName.set('');
      this.error.set('ไฟล์ใหญ่เกิน 20 MB');
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
            evidenceNote: `แนบไฟล์: ${fileLabel} · เอกสาร #${doc.id}`,
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
    FilePickerComponent,
  ],
  template: `
    <h2 mat-dialog-title>อัปโหลดเอกสาร</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="dlg-form" id="project-doc-upload-form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" class="full">
          <mat-label>ชื่อเอกสาร</mat-label>
          <input matInput formControlName="title" placeholder="ตั้งชื่อที่ค้นเจอง่าย — ว่างไว้ใช้ชื่อไฟล์" />
        </mat-form-field>

        <app-file-picker
          label="แนบไฟล์"
          hint="บังคับ · ไม่เกิน 20 MB"
          [accept]="accept"
          [fileName]="selectedFileName()"
          (picked)="onFilePicked($event)"
        />

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
      color: var(--app-text-soft);
    }
    .file-name {
      margin: 0;
      font-size: 0.85rem;
      color: var(--app-accent);
      word-break: break-all;
    }
    .error {
      margin: 0;
      color: var(--app-danger);
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

  onFilePicked(file: File | null): void {
    this.file = file;
    this.selectedFileName.set(file?.name ?? '');
    this.error.set(null);
    if (file && file.size > DOCUMENT_MAX_BYTES) {
      this.file = null;
      this.selectedFileName.set('');
      this.error.set('ไฟล์ใหญ่เกิน 20 MB');
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
    FilePickerComponent,
  ],
  template: `
    <h2 mat-dialog-title>แก้ไขเอกสาร</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="dlg-form" id="project-doc-edit-form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" class="full">
          <mat-label>ชื่อเอกสาร</mat-label>
          <input matInput formControlName="title" />
        </mat-form-field>

        <app-file-picker
          label="เปลี่ยนไฟล์"
          hint="ไม่บังคับ · ไม่เกิน 20 MB"
          [accept]="accept"
          [fileName]="selectedFileName()"
          [currentName]="data.document.fileName"
          (picked)="onFilePicked($event)"
        />

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
    .file-pick {
      display: grid;
      gap: 0.35rem;
      font-size: 0.9rem;
      color: var(--app-text-soft);
    }
    .file-hint {
      margin: 0;
      color: var(--app-accent);
      font-size: 0.85rem;
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
      color: var(--app-danger);
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

  readonly accept = DOCUMENT_ACCEPT;
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly selectedFileName = signal('');
  private file: File | null = null;

  readonly form = this.fb.group({
    title: [this.data.document.title ?? ''],
    note: [this.data.document.note ?? ''],
  });

  onFilePicked(file: File | null): void {
    this.file = file;
    this.selectedFileName.set(file?.name ?? '');
    this.error.set(null);
    if (file && file.size > DOCUMENT_MAX_BYTES) {
      this.file = null;
      this.selectedFileName.set('');
      this.error.set('ไฟล์ใหญ่เกิน 20 MB');
    }
  }

  save(): void {
    if (this.file && this.file.size > DOCUMENT_MAX_BYTES) {
      this.error.set('ไฟล์ใหญ่เกิน 20 MB');
      return;
    }
    const raw = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);
    this.api
      .update(this.data.document.id, {
        title: (raw.title ?? '').trim(),
        note: (raw.note ?? '').trim() || null,
        file: this.file,
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
