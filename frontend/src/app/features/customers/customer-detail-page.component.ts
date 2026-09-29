import { Location } from '@angular/common';
import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of } from 'rxjs';
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
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatMenuModule } from '@angular/material/menu';
import {
  CHANNEL_LABELS,
  CUSTOMER_STATUS_LABELS,
  CommunicationChannel,
  CommunicationLog,
  Contact,
  Customer,
  CustomerStatus,
} from '../../core/models/customer.model';
import { CustomerOverview, CustomerOverviewCountKey } from '../../core/models/customer-overview.model';
import { PROJECT_STATUS_LABELS, Project } from '../../core/models/project.model';
import {
  MA_STATUS_LABELS,
  MaContract,
  MaQuotaStatus,
  maCoverageLabel,
} from '../../core/models/ma.model';
import {
  FollowUp,
  followUpDisplayStatus,
} from '../../core/models/follow-up.model';
import { CustomerLifetimeValue, formatCompleteness } from '../../core/models/report.model';
import { TICKET_PRIORITY_LABELS, TICKET_STATUS_LABELS, Ticket } from '../../core/models/ticket.model';
import {
  WARRANTY_STATUS_LABELS,
  Warranty,
  warrantyDisplayLabel,
  warrantyMaLinkLabel,
} from '../../core/models/warranty.model';
import { AuthService } from '../../core/services/auth.service';
import { CustomerService } from '../../core/services/customer.service';
import { FollowUpService } from '../../core/services/follow-up.service';
import { FollowUpCompleteFlowService } from '../follow-ups/follow-up-complete-dialog.component';
import { MaService } from '../../core/services/ma.service';
import { ProjectService } from '../../core/services/project.service';
import { QuickActionsService } from '../../core/services/quick-actions.service';
import { TicketService } from '../../core/services/ticket.service';
import { WarrantyService } from '../../core/services/warranty.service';
import {
  combineDateAndTime,
  formatThaiDateTime,
  nowTimeString,
  toTimeString,
} from '../../core/utils/date.util';
import { navigateBack } from '../../core/utils/navigation.util';
import { sanitizePhoneDigits, thaiPhoneValidator } from '../../core/utils/phone.util';
import { openConfirmDialog } from '../../shared/components/confirm-dialog.component';
import { PhoneInputDirective } from '../../shared/directives/phone-input.directive';
import { ThaiTimeInputDirective } from '../../shared/directives/thai-time-input.directive';
import { formatMoneyDisplay } from '../../core/utils/money.util';
import { BahtPipe } from '../../shared/pipes/baht.pipe';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { RowAction, RowActionsComponent } from '../../shared/components/row-actions.component';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { ListSkeletonComponent } from '../../shared/components/list-loading.component';
import { createClientPager } from '../../shared/utils/client-pager';
import { FORM_DIALOG, FORM_DIALOG_COMPACT } from '../../shared/utils/form-dialog';
import { CustomerRecordPreviewDialogComponent } from './customer-record-preview-dialog.component';

@Component({
  selector: 'app-customer-detail-page',
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
    MatSnackBarModule,
    MatTableModule,
    MatDialogModule,
    MatMenuModule,
    RowActionsComponent,
    TablePaginatorComponent,
    ListSkeletonComponent,
  ],
  templateUrl: './customer-detail-page.component.html',
  styleUrl: './customer-detail-page.component.scss',
})
export class CustomerDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly api = inject(CustomerService);
  private readonly projectsApi = inject(ProjectService);
  private readonly ticketsApi = inject(TicketService);
  private readonly warrantiesApi = inject(WarrantyService);
  private readonly maApi = inject(MaService);
  private readonly followUpsApi = inject(FollowUpService);
  private readonly followUpComplete = inject(FollowUpCompleteFlowService);
  private readonly auth = inject(AuthService);
  private readonly quickActions = inject(QuickActionsService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly fb = inject(FormBuilder);

  private ready = false;

  /** จากเมนูมุมมอง 360° — โหมดสรุปทุกอย่างของลูกค้ารายเดียว */
  readonly is360Mode = this.route.snapshot.data['mode'] === '360';

  readonly canCreateContact = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('contact.create');
  });
  readonly canUpdateContact = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('contact.update');
  });
  readonly canDeleteContact = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('contact.delete');
  });
  readonly canCreateCommunication = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('communication.create');
  });
  readonly canUpdateCommunication = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('communication.update');
  });
  readonly canDeleteCommunication = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('communication.delete');
  });

  readonly customer = signal<Customer | null>(null);
  readonly overview = signal<CustomerOverview | null>(null);
  readonly contacts = signal<Contact[]>([]);
  readonly logs = signal<CommunicationLog[]>([]);
  readonly projects = signal<Project[]>([]);
  readonly tickets = signal<Ticket[]>([]);
  readonly warranties = signal<Warranty[]>([]);
  readonly contracts = signal<MaContract[]>([]);
  /** โควตาจาก GET /ma-contracts/:id/quota — ไม่คำนวณรอบเอง */
  readonly maQuotasById = signal<Record<number, MaQuotaStatus>>({});
  readonly followUps = signal<FollowUp[]>([]);

  /** เลขบนแท็บจาก GET /customers/:id/overview — รายการจริงโหลดเมื่อเปิดแท็บ */
  readonly tabCounts = computed(() => {
    const o = this.overview();
    const pick = (key: CustomerOverviewCountKey, loaded: number): number => {
      const fromCounts = o?.counts?.[key];
      if (typeof fromCounts === 'number') {
        return fromCounts;
      }
      const rows = o?.[key];
      return Array.isArray(rows) ? rows.length : loaded;
    };
    return {
      projects: pick('projects', this.projects().length),
      warrantiesAndContracts:
        pick('warranties', this.warranties().length) + pick('maContracts', this.contracts().length),
      tickets: pick('tickets', this.tickets().length),
      followUps: pick('followUps', this.followUps().length),
    };
  });

  readonly statusLabels = CUSTOMER_STATUS_LABELS;
  readonly channelLabels = CHANNEL_LABELS;
  readonly projectStatusLabels = PROJECT_STATUS_LABELS;
  readonly ticketStatusLabels = TICKET_STATUS_LABELS;
  readonly ticketPriorityLabels = TICKET_PRIORITY_LABELS;
  readonly warrantyStatusLabels = WARRANTY_STATUS_LABELS;
  readonly maStatusLabels = MA_STATUS_LABELS;
  readonly notFound = signal(false);
  readonly selectedTab = signal(0);

  readonly contactSearch = signal('');
  readonly logSearch = signal('');
  readonly projectSearch = signal('');
  readonly warrantySearch = signal('');
  readonly maSearch = signal('');
  readonly ticketSearch = signal('');
  readonly followUpSearch = signal('');

  readonly contactSearchControl = this.fb.nonNullable.control('');
  readonly logSearchControl = this.fb.nonNullable.control('');
  readonly projectSearchControl = this.fb.nonNullable.control('');
  readonly warrantySearchControl = this.fb.nonNullable.control('');
  readonly maSearchControl = this.fb.nonNullable.control('');
  readonly ticketSearchControl = this.fb.nonNullable.control('');
  readonly followUpSearchControl = this.fb.nonNullable.control('');

  readonly contactColumns = [
    'name',
    'nickname',
    'position',
    'phone',
    'email',
    'lineId',
    'isPrimary',
    'actions',
  ];
  readonly logColumns = ['occurredAt', 'channel', 'subject', 'contact', 'handler', 'actions'];
  readonly projectColumns = ['name', 'status', 'targetEndDate', 'actions'];
  readonly warrantyColumns = ['warrantyNo', 'title', 'duration', 'maLink', 'status', 'endDate', 'actions'];
  readonly warrantyMaLinkLabel = warrantyMaLinkLabel;
  readonly maColumns = ['id', 'plan', 'status', 'quota', 'actions'];
  readonly ticketColumns = ['title', 'status', 'priority', 'actions'];
  readonly followUpColumns = ['title', 'status', 'dueDate', 'actions'];

  readonly filteredContacts = computed(() => {
    const q = this.contactSearch().trim().toLowerCase();
    const list = this.contacts();
    if (!q) {
      return list;
    }
    return list.filter((c) =>
      [c.name, c.nickname, c.position, c.phone, c.email, c.lineId, c.note]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  });

  readonly filteredLogs = computed(() => {
    const q = this.logSearch().trim().toLowerCase();
    const list = this.logs();
    if (!q) {
      return list;
    }
    return list.filter((log) =>
      [
        this.channelLabels[log.channel],
        log.subject,
        log.content,
        log.contactName,
        log.handledBy?.fullName,
        log.occurredAt,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  });

  readonly filteredProjects = computed(() => {
    const q = this.projectSearch().trim().toLowerCase();
    const list = this.projects();
    if (!q) {
      return list;
    }
    return list.filter((p) =>
      [p.name, this.projectStatusLabels[p.status], p.targetEndDate]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  });

  readonly filteredWarranties = computed(() => {
    const q = this.warrantySearch().trim().toLowerCase();
    const list = this.warranties();
    if (!q) {
      return list;
    }
    return list.filter((w) =>
      [
        w.warrantyNo,
        w.delivery?.title,
        w.project?.name,
        String(w.durationMonth),
        warrantyDisplayLabel(w),
        w.endDate,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  });

  readonly filteredContracts = computed(() => {
    const q = this.maSearch().trim().toLowerCase();
    const list = this.contracts();
    if (!q) {
      return list;
    }
    return list.filter((m) =>
      [
        String(m.id),
        m.plan?.name,
        String(m.planId),
        maCoverageLabel(m),
        String(this.remainingQuota(m)),
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  });

  readonly filteredTickets = computed(() => {
    const q = this.ticketSearch().trim().toLowerCase();
    const list = this.tickets();
    if (!q) {
      return list;
    }
    return list.filter((t) =>
      [
        String(t.id),
        t.ticketNo,
        t.title,
        this.ticketStatusLabels[t.status],
        this.ticketPriorityLabels[t.priority],
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  });

  readonly filteredFollowUps = computed(() => {
    const q = this.followUpSearch().trim().toLowerCase();
    const list = this.followUps();
    if (!q) {
      return list;
    }
    return list.filter((f) =>
      [f.title, followUpDisplayStatus(f), f.dueDate, f.detail]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  });

  readonly contactsPager = createClientPager(this.filteredContacts);
  readonly logsPager = createClientPager(this.filteredLogs);
  readonly projectsPager = createClientPager(this.filteredProjects);
  readonly warrantiesPager = createClientPager(this.filteredWarranties);
  readonly contractsPager = createClientPager(this.filteredContracts);
  readonly ticketsPager = createClientPager(this.filteredTickets);
  readonly followUpsPager = createClientPager(this.filteredFollowUps);

  private static readonly TAB_KEYS_REGISTRY = ['contacts', 'logs'] as const;
  private static readonly TAB_KEYS_360 = [
    'contacts',
    'logs',
    'projects',
    'contracts',
    'tickets',
    'follow-ups',
  ] as const;

  private get tabKeys(): readonly string[] {
    return this.is360Mode
      ? CustomerDetailPageComponent.TAB_KEYS_360
      : CustomerDetailPageComponent.TAB_KEYS_REGISTRY;
  }

  private customerId = 0;

  statusLabel(status: Customer['status'] | string): string {
    return this.statusLabels[status as CustomerStatus] ?? String(status);
  }

  channelLabel(channel: CommunicationChannel): string {
    return this.channelLabels[channel];
  }

  projectStatusLabel(status: Project['status']): string {
    return this.projectStatusLabels[status];
  }

  ticketStatusLabel(status: Ticket['status']): string {
    return this.ticketStatusLabels[status];
  }

  ticketPriorityLabel(priority: Ticket['priority']): string {
    return this.ticketPriorityLabels[priority];
  }

  goBack(): void {
    navigateBack(
      this.location,
      this.router,
      this.is360Mode ? '/app/customer-360' : '/app/customers'
    );
  }

  onTabChange(index: number): void {
    this.selectedTab.set(index);
    const tab = this.tabKeys[index];
    if (this.ready) {
      this.ensureTab(tab);
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: tab || null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.customerId = id;
    const tabKey = this.route.snapshot.queryParamMap.get('tab');
    const tabIndex = this.tabKeys.findIndex((key) => key === tabKey);
    if (tabIndex >= 0) {
      this.selectedTab.set(tabIndex);
    } else {
      this.selectedTab.set(0);
    }
    this.contactSearchControl.valueChanges.subscribe((v) => this.contactSearch.set(v));
    this.logSearchControl.valueChanges.subscribe((v) => this.logSearch.set(v));
    this.projectSearchControl.valueChanges.subscribe((v) => this.projectSearch.set(v));
    this.warrantySearchControl.valueChanges.subscribe((v) => this.warrantySearch.set(v));
    this.maSearchControl.valueChanges.subscribe((v) => this.maSearch.set(v));
    this.ticketSearchControl.valueChanges.subscribe((v) => this.ticketSearch.set(v));
    this.followUpSearchControl.valueChanges.subscribe((v) => this.followUpSearch.set(v));
    this.api.fetchCustomer(id).subscribe({
      next: (customer) => {
        this.customer.set(customer);
        this.notFound.set(false);
        this.refreshChildren();
        this.ready = true;
        this.ensureTab(this.tabKeys[this.selectedTab()]);
      },
      error: () => this.notFound.set(true),
    });
    this.api.getOverview(id).subscribe({
      next: (overview) => this.overview.set(overview),
      error: () => this.overview.set(null),
    });
  }

  constructor() {
    effect(() => {
      this.quickActions.ticketCreated();
      this.quickActions.communicationLogged();
      if (this.ready && this.customerId) {
        this.refreshChildren();
        this.api.getOverview(this.customerId).subscribe({
          next: (overview) => this.overview.set(overview),
          error: () => undefined,
        });
      }
    });
  }

  lifetimeValue(): CustomerLifetimeValue | null {
    return this.overview()?.lifetimeValue ?? null;
  }

  hasExcludedLifetime(lv: CustomerLifetimeValue): boolean {
    return (Number(lv.excludedCancelledValue) || 0) > 0 || (lv.excludedCancelledCount ?? 0) > 0;
  }

  /** ข้อความเต็มตอน hover การ์ดมูลค่า (disclaimer / ยกเลิก / ซ้อน) */
  lifetimeTooltip(lv: CustomerLifetimeValue): string {
    const parts: string[] = [];
    if (lv.disclaimer?.trim()) {
      parts.push(lv.disclaimer.trim());
    }
    if (this.hasExcludedLifetime(lv)) {
      const count =
        lv.excludedCancelledCount > 0 ? ` (${lv.excludedCancelledCount} รายการ)` : '';
      parts.push(`ไม่นับสัญญาที่ยกเลิก ${lv.excludedCancelledValue}${count}`);
    }
    if (lv.overlappingContractCount > 0) {
      parts.push(`สัญญาซ้อน ${lv.overlappingContractCount} — ยอดอาจนับซ้ำ`);
    }
    return parts.join('\n');
  }

  oneTimeCompletenessLabel(lv: CustomerLifetimeValue): string {
    return formatCompleteness(lv.oneTimeCompleteness);
  }

  lastContactedAt(c: Customer): string | null {
    return this.overview()?.lastContactedAt ?? c.lastContactedAt ?? null;
  }

  idleDays(c: Customer): number | null {
    const fromOverview = this.overview()?.idleDays;
    if (fromOverview != null) {
      return fromOverview;
    }
    return c.daysSinceLastContact ?? null;
  }

  /** ผู้ติดต่อ + บันทึก โหลดทันที · แท็บอื่นโหลดเมื่อเปิดครั้งแรก แล้วโหลดซ้ำเฉพาะแท็บที่เคยเปิด */
  refreshChildren(): void {
    this.api.listContacts(this.customerId).subscribe({
      next: (rows) => this.contacts.set(rows),
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
    });
    this.api.listLogs(this.customerId).subscribe({
      next: (rows) => this.logs.set(rows),
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
    });
    for (const key of [...this.loadedTabs]) {
      this.loadTab(key);
    }
  }

  private readonly loadedTabs = new Set<string>();
  readonly tabLoading = signal<Record<string, boolean>>({});

  private ensureTab(key: string | undefined): void {
    if (key && !this.loadedTabs.has(key)) {
      this.loadTab(key);
    }
  }

  private setTabLoading(key: string, value: boolean): void {
    this.tabLoading.update((s) => ({ ...s, [key]: value }));
  }

  private loadTab(key: string): void {
    const id = this.customerId;
    switch (key) {
      case 'projects':
        this.loadedTabs.add(key);
        this.setTabLoading(key, true);
        this.projectsApi.listProjectsByCustomer(id).subscribe({
          next: (rows) => {
            this.projects.set(rows);
            this.setTabLoading(key, false);
          },
          error: () => {
            this.projects.set([]);
            this.setTabLoading(key, false);
          },
        });
        break;
      case 'contracts':
        this.loadedTabs.add(key);
        this.setTabLoading(key, true);
        this.warrantiesApi.listExpiring({ customerId: id, days: 365, limit: 100 }).subscribe({
          next: (rows) => this.warranties.set(rows),
          error: () => this.warranties.set([]),
        });
        this.maApi.list({ customerId: id }).subscribe({
          next: (rows) => {
            this.contracts.set(rows);
            this.loadMaQuotas(rows);
            this.setTabLoading(key, false);
          },
          error: () => {
            const fallback = this.maApi.getByCustomer(id);
            this.contracts.set(fallback);
            this.loadMaQuotas(fallback);
            this.setTabLoading(key, false);
          },
        });
        break;
      case 'tickets':
        this.loadedTabs.add(key);
        this.setTabLoading(key, true);
        this.ticketsApi.list({ customerId: id }).subscribe({
          next: (rows) => {
            this.tickets.set(rows);
            this.setTabLoading(key, false);
          },
          error: () => {
            this.tickets.set([]);
            this.setTabLoading(key, false);
          },
        });
        break;
      case 'follow-ups':
        this.loadedTabs.add(key);
        this.setTabLoading(key, true);
        this.followUpsApi.list({ customerId: id }).subscribe({
          next: (rows) => {
            this.followUps.set(rows);
            this.setTabLoading(key, false);
          },
          error: () => {
            this.followUps.set(this.followUpsApi.getByCustomer(id));
            this.setTabLoading(key, false);
          },
        });
        break;
    }
  }

  remainingQuota(c: MaContract): number | null {
    const q = this.maQuotasById()[c.id] ?? c.quota;
    return q?.remaining ?? null;
  }

  maQuotaLabel(c: MaContract): string {
    if (c.status === 'DRAFT' || c.status === 'CANCELLED') {
      return '—';
    }
    const q = this.maQuotasById()[c.id] ?? c.quota;
    if (!q) {
      return '—';
    }
    return `${q.remaining}/${q.quota}`;
  }

  private loadMaQuotas(list: MaContract[]): void {
    const targets = list.filter((c) => c.status !== 'DRAFT' && c.status !== 'CANCELLED');
    if (!targets.length) {
      this.maQuotasById.set({});
      return;
    }
    forkJoin(
      targets.map((c) =>
        this.maApi.getQuota(c.id).pipe(
          map((q) => [c.id, q] as const),
          catchError(() => of([c.id, null] as const))
        )
      )
    ).subscribe({
      next: (pairs) => {
        const next: Record<number, MaQuotaStatus> = {};
        for (const [id, q] of pairs) {
          if (q) {
            next[id] = q;
          }
        }
        this.maQuotasById.set(next);
      },
    });
  }

  isFollowUpOverdue(f: FollowUp): boolean {
    return this.followUpsApi.isOverdue(f);
  }

  followUpStatusLabel(f: FollowUp): string {
    return followUpDisplayStatus(f);
  }

  /** อ่าน isCurrentlyActive เป็นหลัก — status อาจค้าง ACTIVE ระหว่างรอบ cron */
  warrantyStatusLabel(w: Warranty): string {
    return warrantyDisplayLabel(w);
  }

  /** ป้ายตาม coverageState — ไม่ใช้ status ดิบ (EXPIRED ระบบตั้งเองตามวันสิ้นสุด) */
  maStatusLabel(contract: MaContract): string {
    return maCoverageLabel(contract);
  }

  openContactForm(contact?: Contact): void {
    if (contact ? !this.canUpdateContact() : !this.canCreateContact()) {
      this.snack.open(
        contact ? 'ไม่มีสิทธิ์แก้ไขผู้ติดต่อ' : 'ไม่มีสิทธิ์เพิ่มผู้ติดต่อ',
        'ปิด',
        { duration: 3000 }
      );
      return;
    }
    const ref = this.dialog.open(CustomerContactFormDialogComponent, {
      ...FORM_DIALOG,
      data: { customerId: this.customerId, contact: contact ?? null },
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.refreshChildren();
      }
    });
  }

  openContactDetail(contact: Contact): void {
    this.dialog.open(CustomerRecordPreviewDialogComponent, {
      ...FORM_DIALOG_COMPACT,
      data: {
        title: 'รายละเอียดผู้ติดต่อ',
        heading: contact.name,
        meta: `ผู้ติดต่อ #${contact.id} · ${contact.isPrimary ? 'ผู้ติดต่อหลัก' : 'ผู้ติดต่อทั่วไป'}`,
        fields: [
          { label: 'ชื่อเล่น', value: contact.nickname || '—' },
          { label: 'ตำแหน่ง', value: contact.position || '—' },
          { label: 'โทรศัพท์', value: contact.phone || '—' },
          { label: 'อีเมล', value: contact.email || '—' },
          { label: 'LINE ID', value: contact.lineId || '—' },
          { label: 'ผู้ติดต่อหลัก', value: contact.isPrimary ? 'ใช่' : 'ไม่' },
          { label: 'หมายเหตุ', value: contact.note || '—', full: true },
        ],
      },
    });
  }

  removeContact(contact: Contact): void {
    if (!this.canDeleteContact()) {
      this.snack.open('ไม่มีสิทธิ์ลบผู้ติดต่อ', 'ปิด', { duration: 3000 });
      return;
    }
    openConfirmDialog(this.dialog, {
      title: 'ลบผู้ติดต่อ',
      message: `ต้องการลบผู้ติดต่อ「${contact.name}」หรือไม่?`,
      confirmLabel: 'ลบผู้ติดต่อ',
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.api.removeContact(contact.id).subscribe({
        next: () => {
          this.snack.open('ลบผู้ติดต่อแล้ว', 'ปิด', { duration: 2500 });
          this.refreshChildren();
        },
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
      });
    });
  }

  openLogForm(log?: CommunicationLog): void {
    if (log ? !this.canUpdateCommunication() : !this.canCreateCommunication()) {
      this.snack.open(
        log ? 'ไม่มีสิทธิ์แก้ไขบันทึกการติดต่อ' : 'ไม่มีสิทธิ์บันทึกการติดต่อ',
        'ปิด',
        { duration: 3000 }
      );
      return;
    }
    const ref = this.dialog.open(CustomerLogFormDialogComponent, {
      ...FORM_DIALOG,
      data: {
        customerId: this.customerId,
        contacts: this.contacts(),
        log: log ?? null,
      },
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.refreshChildren();
      }
    });
  }

  openLogDetail(log: CommunicationLog): void {
    const heading = log.subject?.trim() || this.channelLabels[log.channel];
    this.dialog.open(CustomerRecordPreviewDialogComponent, {
      ...FORM_DIALOG,
      data: {
        title: 'รายละเอียดการติดต่อ',
        heading,
        meta: `บันทึก #${log.id} · ${this.channelLabels[log.channel]}`,
        fields: [
          { label: 'ช่องทาง', value: this.channelLabels[log.channel] },
          { label: 'วันเวลา', value: formatThaiDateTime(log.occurredAt) || log.occurredAt },
          { label: 'ผู้ติดต่อ', value: log.contactName || '—' },
          { label: 'ผู้บันทึก', value: log.handledBy?.fullName || '—' },
          { label: 'รายละเอียด', value: log.content || '—', full: true },
        ],
        attachmentRef: { refType: 'COMMUNICATION_LOG', refId: log.id },
      },
    });
  }

  removeLog(log: CommunicationLog): void {
    if (!this.canDeleteCommunication()) {
      this.snack.open('ไม่มีสิทธิ์ลบบันทึกการติดต่อ', 'ปิด', { duration: 3000 });
      return;
    }
    const label = log.subject?.trim() || this.channelLabels[log.channel];
    openConfirmDialog(this.dialog, {
      title: 'ลบประวัติการติดต่อ',
      message: `ต้องการลบ「${label}」หรือไม่?`,
      confirmLabel: 'ลบประวัติ',
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.api.removeLog(log.id).subscribe({
        next: () => {
          this.snack.open('ลบประวัติการติดต่อแล้ว', 'ปิด', { duration: 2500 });
          this.refreshChildren();
        },
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
      });
    });
  }

  projectRowActions(row: Project): RowAction[] {
    return [{ label: 'รายละเอียด', primary: true, icon: 'visibility', run: () => this.openProjectDetail(row) }];
  }

  warrantyRowActions(row: Warranty): RowAction[] {
    return [{ label: 'รายละเอียด', primary: true, icon: 'visibility', run: () => this.openWarrantyDetail(row) }];
  }

  maRowActions(row: MaContract): RowAction[] {
    return [{ label: 'รายละเอียด', primary: true, icon: 'visibility', run: () => this.openMaDetail(row) }];
  }

  ticketRowActions(row: Ticket): RowAction[] {
    return [{ label: 'รายละเอียด', primary: true, icon: 'visibility', run: () => this.openTicketDetail(row) }];
  }

  followUpRowActions(row: FollowUp): RowAction[] {
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
        this.loadTab('follow-ups');
      }
    });
  }

  openProjectDetail(project: Project): void {
    void this.router.navigate(['/app/projects', project.id]);
  }

  openWarrantyDetail(warranty: Warranty): void {
    void this.router.navigate(['/app/warranties'], {
      queryParams: { highlight: warranty.id },
    });
  }

  openMaDetail(contract: MaContract): void {
    void this.router.navigate(['/app/ma', contract.id]);
  }

  /** การ์ดที่ถูกตัดด้วยจุดไข่ปลา — กดเพื่ออ่านค่าเต็ม */
  openFieldDetail(label: string, value: string | null | undefined, href?: string | null): void {
    const text = value?.trim();
    if (!text) {
      return;
    }
    this.dialog.open(CustomerFieldDetailDialogComponent, {
      ...FORM_DIALOG_COMPACT,
      data: { label, value: text, href: href || null },
    });
  }

  externalHref(value: string | null | undefined): string | null {
    const raw = value?.trim();
    if (!raw) {
      return null;
    }
    if (/^https?:\/\//i.test(raw)) {
      return raw;
    }
    return null;
  }

  openLifetimeDetail(lv: CustomerLifetimeValue): void {
    const amount = formatMoneyDisplay(lv.totalContractValue);
    const lines = [
      `มูลค่า: ${amount ? `฿${amount}` : '—'}`,
      this.oneTimeCompletenessLabel(lv),
      this.lifetimeTooltip(lv),
    ].filter((line) => !!line?.trim());
    this.openFieldDetail('มูลค่า', lines.join('\n'));
  }

  openTicketDetail(ticket: Ticket): void {
    void this.router.navigate(['/app/tickets', ticket.id]);
  }

  openFollowUpDetail(followUp: FollowUp): void {
    void this.router.navigate(['/app/follow-ups'], {
      queryParams: { highlight: followUp.id },
    });
  }
}

@Component({
  selector: 'app-customer-field-detail-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>รายละเอียด</h2>
    <mat-dialog-content>
      <article class="preview-card">
        <header class="preview-card__head">
          <h3>{{ data.label }}</h3>
        </header>
        <dl class="preview-card__grid">
          <div class="full">
            <dd class="desc">{{ data.value }}</dd>
          </div>
        </dl>
      </article>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (data.href) {
        <a mat-stroked-button [href]="data.href" target="_blank" rel="noopener noreferrer">
          <mat-icon>open_in_new</mat-icon>
          เปิดลิงก์
        </a>
      }
      <button mat-button type="button" mat-dialog-close>ปิด</button>
    </mat-dialog-actions>
  `,
  styles: `
    .preview-card__head {
      margin-bottom: 0.85rem;
      h3 {
        margin: 0;
        font-size: 1.2rem;
        font-weight: 700;
        line-height: 1.35;
      }
    }
    .preview-card__grid {
      display: grid;
      margin: 0;
      padding: 0.85rem 0.95rem;
      border-radius: 12px;
      background: #f8fafc;
      border: 1px solid rgb(15 23 42 / 0.06);
      dt {
        margin: 0;
        font-size: 0.75rem;
        color: #64748b;
      }
      dd {
        margin: 0.15rem 0 0;
        font-size: 0.92rem;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        word-break: break-word;
        line-height: 1.45;
      }
    }
    mat-dialog-actions a mat-icon {
      margin-right: 0.25rem;
      font-size: 1.1rem;
      width: 1.1rem;
      height: 1.1rem;
      vertical-align: middle;
    }
  `,
})
class CustomerFieldDetailDialogComponent {
  readonly data = inject<{ label: string; value: string; href: string | null }>(MAT_DIALOG_DATA);
}

/* ——— Contact form dialog ——— */

@Component({
  selector: 'app-customer-contact-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatButtonModule,
    MatSnackBarModule,
    PhoneInputDirective,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.contact ? 'แก้ไขผู้ติดต่อ' : 'เพิ่มผู้ติดต่อ' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="dlg-form" id="customer-contact-form" (ngSubmit)="save()">
        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>ชื่อ-นามสกุล</mat-label>
            <input matInput formControlName="name" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>ชื่อเล่น</mat-label>
            <input matInput formControlName="nickname" />
          </mat-form-field>
        </div>
        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>ตำแหน่ง</mat-label>
            <input matInput formControlName="position" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>โทรศัพท์</mat-label>
            <input
              matInput
              appPhoneInput
              formControlName="phone"
              type="tel"
              inputmode="numeric"
              maxlength="10"
            />
            @if (form.controls.phone.hasError('thaiPhone')) {
              <mat-error>เบอร์ต้องขึ้นต้นด้วย 0 และมี 9–10 หลัก</mat-error>
            }
          </mat-form-field>
        </div>
        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>อีเมล</mat-label>
            <input matInput formControlName="email" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>LINE ID</mat-label>
            <input matInput formControlName="lineId" />
          </mat-form-field>
        </div>
        <mat-form-field appearance="outline" class="full">
          <mat-label>หมายเหตุ</mat-label>
          <textarea matInput rows="2" formControlName="note"></textarea>
        </mat-form-field>
        <mat-checkbox formControlName="isPrimary">ตั้งเป็นผู้ติดต่อหลัก</mat-checkbox>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button color="primary" type="submit" form="customer-contact-form">
        บันทึก
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .dlg-form {
      display: grid;
      gap: 0.35rem;
      min-width: min(720px, 92vw);
      padding-top: 0.25rem;
    }
    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.65rem;
    }
    .full {
      width: 100%;
    }
  `,
})
export class CustomerContactFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(CustomerService);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject(MatDialogRef<CustomerContactFormDialogComponent, boolean>);
  readonly data = inject<{ customerId: number; contact: Contact | null }>(MAT_DIALOG_DATA);

  readonly form = this.fb.nonNullable.group({
    name: [this.data.contact?.name ?? '', Validators.required],
    nickname: [this.data.contact?.nickname ?? ''],
    position: [this.data.contact?.position ?? ''],
    phone: [sanitizePhoneDigits(this.data.contact?.phone ?? ''), thaiPhoneValidator],
    email: [this.data.contact?.email ?? ''],
    lineId: [this.data.contact?.lineId ?? ''],
    isPrimary: [this.data.contact?.isPrimary ?? false],
    note: [this.data.contact?.note ?? ''],
  });

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.api
      .saveContact(
        this.data.customerId,
        {
          name: raw.name.trim(),
          nickname: raw.nickname.trim() || undefined,
          position: raw.position.trim() || undefined,
          phone: raw.phone.trim() ? sanitizePhoneDigits(raw.phone) : undefined,
          email: raw.email.trim() || undefined,
          lineId: raw.lineId.trim() || undefined,
          isPrimary: raw.isPrimary,
          note: raw.note.trim() || undefined,
        },
        this.data.contact?.id
      )
      .subscribe({
        next: () => {
          this.snack.open(
            this.data.contact ? 'อัปเดตผู้ติดต่อแล้ว' : 'บันทึกผู้ติดต่อแล้ว',
            'ปิด',
            { duration: 2500 }
          );
          this.ref.close(true);
        },
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
      });
  }
}

/* ——— Communication log form dialog ——— */

@Component({
  selector: 'app-customer-log-form-dialog',
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
    ThaiTimeInputDirective,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.log ? 'แก้ไขประวัติการติดต่อ' : 'บันทึกการติดต่อ' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="dlg-form" id="customer-log-form" (ngSubmit)="save()">
        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>ช่องทาง</mat-label>
            <mat-select formControlName="channel">
              @for (ch of channels; track ch) {
                <mat-option [value]="ch">{{ channelLabels[ch] }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>วันที่ติดต่อ</mat-label>
            <input
              matInput
              [matDatepicker]="logPicker"
              formControlName="occurredDate"
              readonly
              (click)="logPicker.open()"
            />
            <mat-datepicker-toggle matIconSuffix [for]="logPicker"></mat-datepicker-toggle>
            <mat-datepicker #logPicker></mat-datepicker>
          </mat-form-field>
        </div>
        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>เวลาที่ติดต่อ</mat-label>
            <input matInput appThaiTimeInput formControlName="occurredTime" />
            <span matTextSuffix>น.</span>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>ผู้ติดต่อ</mat-label>
            <mat-select formControlName="contactId">
              <mat-option [value]="null">—</mat-option>
              @for (contact of data.contacts; track contact.id) {
                <mat-option [value]="contact.id">{{ contact.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
        <mat-form-field appearance="outline" class="full">
          <mat-label>หัวข้อ</mat-label>
          <input matInput formControlName="subject" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>สรุปการคุย</mat-label>
          <textarea matInput rows="3" formControlName="content"></textarea>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button color="primary" type="submit" form="customer-log-form">
        บันทึก
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .dlg-form {
      display: grid;
      gap: 0.35rem;
      min-width: min(720px, 92vw);
      padding-top: 0.25rem;
    }
    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.65rem;
    }
    .full {
      width: 100%;
    }
  `,
})
export class CustomerLogFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(CustomerService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject(MatDialogRef<CustomerLogFormDialogComponent, boolean>);
  readonly data = inject<{
    customerId: number;
    contacts: Contact[];
    log: CommunicationLog | null;
  }>(MAT_DIALOG_DATA);

  readonly channelLabels = CHANNEL_LABELS;
  readonly channels = Object.keys(CHANNEL_LABELS) as CommunicationChannel[];

  readonly form = this.fb.nonNullable.group({
    channel: [
      (this.data.log?.channel ?? 'LINE') as CommunicationChannel,
      Validators.required,
    ],
    contactId: [this.data.log?.contactId ?? (null as number | null)],
    subject: [this.data.log?.subject ?? ''],
    content: [this.data.log?.content ?? '', Validators.required],
    occurredDate: [
      (this.data.log
        ? new Date(this.data.log.occurredAt)
        : new Date()) as Date | null,
      Validators.required,
    ],
    occurredTime: [
      this.data.log ? toTimeString(this.data.log.occurredAt) : nowTimeString(),
      Validators.required,
    ],
  });

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const payload = {
      channel: raw.channel,
      occurredAt: combineDateAndTime(raw.occurredDate, raw.occurredTime),
      contactId: raw.contactId ?? undefined,
      subject: raw.subject.trim() || undefined,
      content: raw.content.trim() || undefined,
      handledByUserId: this.auth.currentUser()?.id,
    };
    const req$ = this.data.log
      ? this.api.updateLog(this.data.log.id, payload)
      : this.api.addLog(this.data.customerId, payload);

    req$.subscribe({
      next: () => {
        this.snack.open(
          this.data.log ? 'อัปเดตประวัติการติดต่อแล้ว' : 'บันทึกประวัติการติดต่อแล้ว',
          'ปิด',
          { duration: 2500 }
        );
        this.ref.close(true);
      },
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
    });
  }
}
