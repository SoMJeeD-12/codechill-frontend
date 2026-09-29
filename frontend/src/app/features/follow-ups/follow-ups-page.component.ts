import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
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
import { MatMenuModule } from '@angular/material/menu';
import {
  FOLLOW_UP_STATUS_LABELS,
  FollowUp,
  FollowUpProjectSummary,
  FollowUpWritableStatus,
  followUpDisplayStatus,
} from '../../core/models/follow-up.model';
import { Project, ProjectOption } from '../../core/models/project.model';
import { AuthService } from '../../core/services/auth.service';
import { CustomerService } from '../../core/services/customer.service';
import {
  FollowUpCreateInput,
  FollowUpService,
  FollowUpUpdateInput,
} from '../../core/services/follow-up.service';
import { ProjectService } from '../../core/services/project.service';
import { UserService } from '../../core/services/user.service';
import { parseDateOnly, toDateOnlyString } from '../../core/utils/date.util';
import { openConfirmDialog } from '../../shared/components/confirm-dialog.component';
import {
  EntityPickerComponent,
  PickerOption,
} from '../../shared/components/entity-picker.component';
import {
  customerSearchFn,
  projectPickerOption,
} from '../../shared/components/entity-search';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { RowAction, RowActionsComponent } from '../../shared/components/row-actions.component';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import {
  ListLoadingBarComponent,
  ListSkeletonComponent,
} from '../../shared/components/list-loading.component';
import { FORM_DIALOG, FORM_DIALOG_COMPACT } from '../../shared/utils/form-dialog';
import { createServerList } from '../../shared/utils/server-list';
import { CustomerRecordPreviewDialogComponent } from '../customers/customer-record-preview-dialog.component';
import { Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, skip, tap } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavAttentionService } from '../../core/services/nav-attention.service';
import { FollowUpCompleteFlowService } from './follow-up-complete-dialog.component';

type FollowUpView = 'all' | 'today' | 'overdue' | 'planned' | 'mine';

/** preset เมื่อสร้างจากหน้าโปรเจกต์/ลูกค้า */
export type FollowUpFormPreset = {
  customerId?: number;
  customerName?: string | null;
  projectId?: number;
  project?: FollowUpProjectSummary | null;
};

export type FollowUpFormDialogData = FollowUp | FollowUpFormPreset | null;

function isFollowUpRow(data: FollowUpFormDialogData): data is FollowUp {
  return !!data && typeof (data as FollowUp).id === 'number' && (data as FollowUp).id > 0;
}

@Component({
  selector: 'app-follow-ups-page',
  standalone: true,
  imports: [
    ThaiDatePipe,
    RouterLink,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatDialogModule,
    MatSnackBarModule,
    MatMenuModule,
    RowActionsComponent,
    TablePaginatorComponent,
    ListLoadingBarComponent,
    ListSkeletonComponent,
  ],
  templateUrl: './follow-ups-page.component.html',
  styleUrl: './follow-ups-page.component.scss',
})
export class FollowUpsPageComponent implements OnInit {
  readonly api = inject(FollowUpService);
  private readonly customersApi = inject(CustomerService);
  private readonly usersApi = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly attention = inject(NavAttentionService);
  private readonly completeFlow = inject(FollowUpCompleteFlowService);

  /** GET /follow-ups?page&limit&search&(overdue|status|assignedUserId|dueByToday)&sortBy — แบ่งหน้าฝั่ง server */
  readonly list = createServerList<FollowUp, { view: FollowUpView }>({
    namespace: 'follow-ups',
    filters: { view: 'all' },
    sortBy: 'dueDate',
    sortOrder: 'ASC',
    fetch: ({ filters, ...req }) => {
      const me = this.auth.currentUser();
      const view = filters.view;
      const request = this.api.listPage({
        ...req,
        overdue: view === 'overdue' ? true : undefined,
        status: view === 'planned' ? 'PLANNED' : undefined,
        assignedUserId: (view === 'mine' || view === 'today') && me ? me.id : undefined,
        dueByToday: view === 'today' ? true : undefined,
      });
      if (view !== 'today' || req.search) {
        return request;
      }
      // badge = total ของ ?assignedUserId=me&dueByToday=true — ไม่ตรงให้ดึง /nav/counts ใหม่
      return request.pipe(
        tap((page) => {
          if (page.total !== this.attention.badge('follow-ups')) {
            this.attention.refreshBadges();
          }
        })
      );
    },
  });
  readonly todayBadge = computed(() => this.attention.badge('follow-ups'));

  constructor() {
    // คลิกเมนู (มี badge) ขณะอยู่หน้านี้ — component เดิม ต้องตาม query เอง
    this.route.queryParamMap.pipe(skip(1), takeUntilDestroyed()).subscribe((q) => {
      if (q.get('view') === 'today' && this.view() !== 'today') {
        this.list.setFilter('view', 'today');
      }
    });
  }
  readonly items = this.list.items;
  readonly loading = this.list.loading;
  readonly view = computed(() => this.list.filters().view);
  readonly searchControl = this.list.searchControl;
  readonly columns = [
    'title',
    'projectCode',
    'project',
    'customer',
    'dueDate',
    'daysLeft',
    'assignee',
    'status',
    'actions',
  ];

  readonly canCreate = computed(() => this.auth.hasPermission('follow-ups', 'create'));
  readonly canUpdate = computed(() => this.auth.hasPermission('follow-ups', 'update'));
  readonly canComplete = this.completeFlow.canComplete;
  readonly canDelete = computed(() => this.auth.hasPermission('follow-ups', 'delete'));

  ngOnInit(): void {
    // follow-up ไม่ใช่ TASK/TICKET — ใช้ TASK เป็นรายชื่อพนักงาน ACTIVE ที่มอบหมายงานได้
    this.usersApi.loadForPicker(this.auth.currentUser(), { capability: 'TASK' }).subscribe();

    // เข้ามาจากการ์ด "ติดตามที่เลยกำหนด" บนหน้าแรก
    if (this.route.snapshot.queryParamMap.get('overdue') === 'true') {
      this.list.patchFilters({ view: 'overdue' });
      return;
    }
    this.list.start();
  }

  setView(view: FollowUpView): void {
    this.list.setFilter('view', view);
  }

  toggleSort(key: string): void {
    this.list.toggleSort(key);
  }

  sortIcon(key: string): string {
    return this.list.sortIcon(key);
  }

  reload(): void {
    this.list.reload({ invalidate: true });
  }

  customerName(f: FollowUp): string {
    return f.customer?.name ?? this.customersApi.getCustomer(f.customerId)?.name ?? `#${f.customerId}`;
  }

  projectLabel(f: FollowUp): string {
    if (f.project?.name) {
      return f.project.code ? `${f.project.code} · ${f.project.name}` : f.project.name;
    }
    if (f.projectId == null) {
      return '—';
    }
    return `#${f.projectId}`;
  }

  projectName(f: FollowUp): string {
    if (f.project?.name) {
      return f.project.name;
    }
    return f.projectId == null ? '—' : `#${f.projectId}`;
  }

  userName(f: FollowUp): string {
    if (f.assignedUser?.fullName) {
      return f.assignedUser.fullName;
    }
    if (!f.assignedUserId) {
      return '—';
    }
    return this.usersApi.getById(f.assignedUserId)?.fullName ?? `#${f.assignedUserId}`;
  }

  followUpTip(f: FollowUp): string {
    const parts = [f.title];
    if (f.detail?.trim()) {
      parts.push(f.detail.trim());
    }
    if (f.resultNote?.trim()) {
      parts.push(`ผล: ${f.resultNote.trim()}`);
    }
    return parts.join(' — ');
  }

  statusLabel(f: FollowUp): string {
    return followUpDisplayStatus(f);
  }

  daysLeftLabel(f: FollowUp): string {
    const days = this.api.daysUntilDue(f);
    if (days === null) {
      return '—';
    }
    if (days < 0) {
      return `เลยมา ${Math.abs(days)} วัน`;
    }
    if (days === 0) {
      return 'ครบวันนี้';
    }
    return `เหลือ ${days} วัน`;
  }

  daysLeftClass(f: FollowUp): string {
    if (f.status === 'DONE' || f.status === 'CANCELLED') {
      return '';
    }
    if (this.api.isOverdue(f)) {
      return 'overdue';
    }
    const days = this.api.daysUntilDue(f);
    if (days !== null && days <= 3) {
      return 'soon';
    }
    return '';
  }

  openCreate(row?: FollowUp, preset?: FollowUpFormPreset): void {
    if (row ? !this.canUpdate() : !this.canCreate()) {
      this.snack.open('คุณไม่มีสิทธิ์ดำเนินการนี้', 'ปิด', { duration: 3000 });
      return;
    }
    const ref = this.dialog.open(FollowUpFormDialogComponent, {
      ...FORM_DIALOG,
      data: row ?? preset ?? null,
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.reload();
      }
    });
  }

  openFollowUpDetail(row: FollowUp): void {
    this.dialog.open(CustomerRecordPreviewDialogComponent, {
      ...FORM_DIALOG_COMPACT,
      data: {
        title: 'รายละเอียดงานติดตาม',
        heading: row.title,
        meta: this.statusLabel(row),
        fields: [
          { label: 'สิ่งที่วางแผนไว้', value: row.detail?.trim() || 'ไม่มีรายละเอียดแผน', full: true },
          { label: 'ผลตอนทำเสร็จ', value: row.resultNote?.trim() || 'ยังไม่มีผล', full: true },
        ],
      },
    });
  }

  followUpRowActions(row: FollowUp): RowAction[] {
    const actions: RowAction[] = [
      { label: 'รายละเอียด', icon: 'visibility', run: () => this.openFollowUpDetail(row) },
    ];
    if (row.status === 'PLANNED' && this.canComplete()) {
      actions.push({ label: 'เสร็จแล้ว', primary: true, icon: 'task_alt', run: () => this.markDone(row) });
    }
    if (this.canUpdate()) {
      actions.push({ label: 'แก้ไข', icon: 'edit', run: () => this.openCreate(row) });
    }
    if (this.canDelete()) {
      actions.push({ label: 'ลบ', icon: 'delete', danger: true, run: () => this.remove(row) });
    }
    return actions;
  }

  markDone(row: FollowUp): void {
    this.completeFlow.open(row).subscribe((result) => {
      if (result) {
        this.reload();
      }
    });
  }

  remove(row: FollowUp): void {
    if (!this.canDelete()) {
      return;
    }
    openConfirmDialog(this.dialog, {
      title: 'ลบงานติดตาม',
      message: `ต้องการลบงานติดตาม「${row.title}」หรือไม่?`,
      confirmLabel: 'ลบงานติดตาม',
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.api.remove(row.id).subscribe({
        next: () => {
          this.snack.open('ลบแล้ว', 'ปิด', { duration: 2500 });
          this.reload();
        },
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
      });
    });
  }
}

@Component({
  selector: 'app-follow-up-form-dialog',
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
    MatCheckboxModule,
    MatAutocompleteModule,
    EntityPickerComponent,
  ],
  templateUrl: './follow-up-form-dialog.component.html',
  styleUrl: './follow-up-form-dialog.component.scss',
})
export class FollowUpFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(FollowUpService);
  private readonly customersApi = inject(CustomerService);
  private readonly projectsApi = inject(ProjectService);
  private readonly usersApi = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject(MatDialogRef<FollowUpFormDialogComponent, boolean>);
  readonly data = inject<FollowUpFormDialogData>(MAT_DIALOG_DATA);

  readonly searchCustomers = customerSearchFn(this.customersApi);
  readonly users = this.usersApi.assignableTask;
  readonly statuses = Object.keys(FOLLOW_UP_STATUS_LABELS) as FollowUpWritableStatus[];
  readonly statusLabels = FOLLOW_UP_STATUS_LABELS;
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  private readonly editRow: FollowUp | null = isFollowUpRow(this.data) ? this.data : null;
  readonly isEdit = !!this.editRow;
  readonly projectLocked = !this.isEdit && !!this.presetProjectId();
  /** แก้ไข = ลูกค้าเปลี่ยนไม่ได้ · สร้างจากหน้าโปรเจกต์ = ล็อกตามโปรเจกต์ */
  readonly customerLocked = this.isEdit || this.projectLocked;

  readonly withoutProject = signal(this.initialWithoutProject());
  /** เลือกลูกค้าก่อน แล้วช่องโปรเจกต์แสดงเฉพาะโปรเจกต์ของลูกค้านั้น */
  readonly projectCustomer = signal<PickerOption | null>(this.initialCustomerOption());
  readonly customerProjects = signal<Project[]>([]);
  readonly customerProjectsLoading = signal(false);
  private readonly openFollowUps = signal<FollowUp[]>([]);
  /** โปรเจกต์ที่มีงานติดตามค้าง (PLANNED) และยังไม่เลยกำหนด — ห้ามสร้างซ้ำ */
  readonly blockedProjects = computed(() => {
    const map = new Map<number, FollowUp>();
    for (const f of this.openFollowUps()) {
      if (f.projectId == null || f.status !== 'PLANNED' || f.isOverdue || f.id === this.editRow?.id) {
        continue;
      }
      const prev = map.get(f.projectId);
      if (!prev || f.dueDate > prev.dueDate) {
        map.set(f.projectId, f);
      }
    }
    return map;
  });
  readonly projectSuggestions = signal<ProjectOption[]>([]);
  readonly projectQueryReady = signal(false);
  readonly selectedProject = signal<Project | FollowUpProjectSummary | null>(
    this.initialSelectedProject()
  );

  readonly projectSearchControl = this.fb.control<string | Project | FollowUpProjectSummary>('');
  readonly customerOption = signal<PickerOption | null>(this.initialCustomerOption());

  readonly form = this.fb.group({
    customerId: [
      {
        value: this.initialCustomerId(),
        disabled: this.isEdit,
      },
      Validators.min(1),
    ],
    projectId: [this.initialProjectId() as number | null],
    title: [this.editRow?.title ?? '', Validators.required],
    dueDate: [parseDateOnly(this.editRow?.dueDate) as Date | null, Validators.required],
    assignedUserId: [this.editRow?.assignedUserId ?? (null as number | null)],
    status: [
      (this.editRow?.status === 'OVERDUE'
        ? 'PLANNED'
        : (this.editRow?.status ?? 'PLANNED')) as FollowUpWritableStatus,
    ],
    detail: [this.editRow?.detail ?? ''],
    resultNote: [this.editRow?.resultNote ?? ''],
  });

  constructor() {
    if (!this.isEdit) {
      const me = this.auth.currentUser();
      this.form.patchValue({
        assignedUserId: me?.id ?? null,
        dueDate: new Date(),
      });
      if (this.withoutProject()) {
        const presetCustomer = this.presetCustomerId();
        this.form.patchValue({ customerId: presetCustomer ?? 0 });
        if (presetCustomer) {
          this.form.controls.customerId.disable({ emitEvent: false });
        }
      }
    }

    const selected = this.selectedProject();
    if (selected) {
      this.projectSearchControl.setValue(selected, { emitEvent: false });
    }
    if (this.projectLocked) {
      this.projectSearchControl.disable({ emitEvent: false });
    } else {
      this.projectSearchControl.valueChanges
        .pipe(
          debounceTime(300),
          distinctUntilChanged((a, b) => this.projectSearchKey(a) === this.projectSearchKey(b))
        )
        .subscribe((value) => {
          if (this.withoutProject()) {
            return;
          }
          this.onProjectSearchChanged(value);
        });
    }

    const customerId = this.projectCustomer()?.id;
    if (!this.withoutProject() && !this.projectLocked && customerId) {
      this.loadCustomerProjects(customerId);
    }
    const lockedProjectId = this.presetProjectId();
    if (this.projectLocked && lockedProjectId) {
      this.loadOpenFollowUps({ projectId: lockedProjectId });
    }
    this.syncProjectInputEnabled();
    this.syncTargetValidators();
  }

  onProjectCustomerPicked(option: PickerOption | null): void {
    if (this.customerLocked) {
      return;
    }
    const changed = this.projectCustomer()?.id !== option?.id;
    this.projectCustomer.set(option);
    if (changed) {
      this.selectedProject.set(null);
      this.form.patchValue({ projectId: null });
      this.projectSearchControl.setValue('', { emitEvent: false });
    }
    this.error.set(null);
    this.loadCustomerProjects(option?.id ?? null);
  }

  private customerProjectsSub?: Subscription;

  private loadCustomerProjects(customerId: number | null): void {
    this.customerProjectsSub?.unsubscribe();
    this.customerProjects.set([]);
    this.projectSuggestions.set([]);
    this.projectQueryReady.set(false);
    this.customerProjectsLoading.set(!!customerId);
    this.syncProjectInputEnabled();
    this.loadOpenFollowUps(customerId ? { customerId } : null);
    if (!customerId) {
      return;
    }
    this.customerProjectsSub = this.projectsApi.listProjectsByCustomer(customerId).subscribe({
      next: (list) => {
        this.customerProjectsLoading.set(false);
        this.customerProjects.set(list);
        this.syncProjectInputEnabled();
      },
      error: (err: Error) => {
        this.customerProjectsLoading.set(false);
        this.error.set(err.message);
        this.syncProjectInputEnabled();
      },
    });
  }

  private openFollowUpsSub?: Subscription;

  private loadOpenFollowUps(scope: { customerId: number } | { projectId: number } | null): void {
    this.openFollowUpsSub?.unsubscribe();
    this.openFollowUps.set([]);
    if (!scope) {
      return;
    }
    this.openFollowUpsSub = this.api
      .listPage({ ...scope, status: 'PLANNED', page: 1, limit: 100 })
      .subscribe({
        next: (res) => {
          this.openFollowUps.set(res.items);
          const selected = this.selectedProject();
          if (selected && !this.projectLocked && this.blockedProjects().has(selected.id)) {
            this.selectedProject.set(null);
            this.form.patchValue({ projectId: null });
            this.projectSearchControl.setValue('', { emitEvent: false });
          }
        },
        error: () => this.openFollowUps.set([]),
      });
  }

  blockedFor(projectId: number): FollowUp | undefined {
    return this.blockedProjects().get(projectId);
  }

  formatDue(dueDate: string): string {
    const d = parseDateOnly(dueDate);
    return d
      ? d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
      : dueDate;
  }

  private syncProjectInputEnabled(): void {
    const ctrl = this.projectSearchControl;
    const enable =
      !this.projectLocked && !!this.projectCustomer() && !this.customerProjectsLoading();
    if (enable && ctrl.disabled) {
      ctrl.enable({ emitEvent: false });
    } else if (!enable && ctrl.enabled) {
      ctrl.disable({ emitEvent: false });
    }
  }

  projectPlaceholder(): string {
    if (!this.projectCustomer()) {
      return 'เลือกลูกค้าก่อน';
    }
    if (this.customerProjectsLoading()) {
      return 'กำลังโหลดโปรเจกต์…';
    }
    return 'พิมพ์รหัสหรือชื่อโปรเจกต์';
  }

  readonly displayProject = (
    value: string | Project | FollowUpProjectSummary | null
  ): string => {
    if (!value) {
      return '';
    }
    if (typeof value === 'string') {
      return value;
    }
    return value.code ? `${value.code} · ${value.name}` : value.name;
  };

  setWithoutProject(checked: boolean): void {
    if (this.projectLocked) {
      return;
    }
    this.withoutProject.set(checked);
    if (checked) {
      this.selectedProject.set(null);
      this.form.patchValue({ projectId: null });
      this.projectSearchControl.setValue('', { emitEvent: false });
      this.projectSuggestions.set([]);
      this.projectQueryReady.set(false);
    } else {
      this.form.patchValue({ customerId: 0 });
      this.customerOption.set(null);
      this.loadCustomerProjects(this.projectCustomer()?.id ?? null);
    }
    this.syncTargetValidators();
    this.error.set(null);
  }

  onProjectSelected(event: MatAutocompleteSelectedEvent): void {
    this.selectProject(event.option.value as FollowUpProjectSummary);
  }

  save(): void {
    this.syncTargetValidators();
    const pickedProjectId = this.withoutProject() ? null : this.form.getRawValue().projectId;
    const blocking = pickedProjectId ? this.blockedFor(Number(pickedProjectId)) : undefined;
    if (blocking) {
      this.error.set(
        `โปรเจกต์นี้มีงานติดตาม「${blocking.title}」ค้างอยู่ ครบกำหนด ${this.formatDue(blocking.dueDate)} — ปิดงานเดิมก่อนหรือแก้ไขงานเดิมแทน`
      );
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      if (!this.withoutProject() && !this.form.getRawValue().projectId) {
        this.error.set(this.projectCustomer() ? 'กรุณาเลือกโปรเจกต์' : 'กรุณาเลือกลูกค้าและโปรเจกต์');
        this.projectSearchControl.markAsTouched();
      }
      return;
    }
    const raw = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);

    if (this.isEdit && this.editRow) {
      const payload: FollowUpUpdateInput = {
        title: raw.title ?? '',
        dueDate: toDateOnlyString(raw.dueDate),
        assignedUserId: raw.assignedUserId,
        status: (raw.status as FollowUpWritableStatus) ?? 'PLANNED',
        detail: raw.detail ?? '',
        resultNote: raw.resultNote ?? '',
        projectId: this.withoutProject() ? null : Number(raw.projectId) || null,
      };
      this.api.update(this.editRow.id, payload).subscribe({
        next: (row) => this.onSaved(row, true),
        error: (err: Error) => this.onError(err),
      });
      return;
    }

    const payload: FollowUpCreateInput = this.withoutProject()
      ? {
          customerId: Number(raw.customerId),
          title: raw.title ?? '',
          dueDate: toDateOnlyString(raw.dueDate),
          assignedUserId: raw.assignedUserId,
          detail: raw.detail ?? '',
        }
      : {
          projectId: Number(raw.projectId),
          title: raw.title ?? '',
          dueDate: toDateOnlyString(raw.dueDate),
          assignedUserId: raw.assignedUserId,
          detail: raw.detail ?? '',
        };
    this.api.create(payload).subscribe({
      next: (row) => this.onSaved(row, false),
      error: (err: Error) => this.onError(err),
    });
  }

  private onSaved(row: FollowUp, isEdit: boolean): void {
    this.saving.set(false);
    this.snack.open(
      row.isOverdue
        ? 'บันทึกแล้ว — รายการนี้อยู่ในหมวดเลยกำหนด'
        : isEdit
          ? 'บันทึกแล้ว'
          : 'สร้างงานติดตามแล้ว',
      'ปิด',
      { duration: 2800 }
    );
    this.ref.close(true);
  }

  private onError(err: Error): void {
    this.saving.set(false);
    this.error.set(err.message);
  }

  private selectProject(project: Project | FollowUpProjectSummary): void {
    this.selectedProject.set(project);
    this.form.patchValue({ projectId: project.id });
    this.projectSearchControl.setValue(project, { emitEvent: false });
    this.projectSuggestions.set([]);
    this.projectQueryReady.set(false);
    this.error.set(null);
    this.syncTargetValidators();
  }

  private onProjectSearchChanged(
    value: string | Project | FollowUpProjectSummary | null
  ): void {
    if (typeof value !== 'string') {
      return;
    }
    const search = value.trim();
    const selected = this.selectedProject();
    if (selected && this.displayProject(selected) !== search) {
      this.selectedProject.set(null);
      this.form.patchValue({ projectId: null });
    }
    this.loadProjectSuggestions(search);
  }

  onProjectFieldFocus(): void {
    if (this.projectLocked || this.selectedProject() || this.projectSuggestions().length) {
      return;
    }
    const raw = this.projectSearchControl.value;
    this.loadProjectSuggestions(typeof raw === 'string' ? raw.trim() : '');
  }

  /** กรองจากโปรเจกต์ของลูกค้าที่โหลดไว้แล้ว — ไม่ยิง API ซ้ำ */
  private loadProjectSuggestions(search: string): void {
    if (!this.projectCustomer() || this.customerProjectsLoading()) {
      return;
    }
    const q = search.toLowerCase();
    this.projectQueryReady.set(true);
    this.projectSuggestions.set(
      this.customerProjects().filter(
        (p) =>
          !q || p.name.toLowerCase().includes(q) || (p.code ?? '').toLowerCase().includes(q)
      )
    );
  }

  projectStatusBadge(p: ProjectOption): string | null {
    return projectPickerOption(p).badge ?? null;
  }

  private projectSearchKey(
    value: string | Project | FollowUpProjectSummary | null
  ): string {
    if (!value) {
      return '';
    }
    if (typeof value === 'string') {
      return value.trim().toLowerCase();
    }
    return `id:${value.id}`;
  }

  private syncTargetValidators(): void {
    const customerCtrl = this.form.controls.customerId;
    const projectCtrl = this.form.controls.projectId;
    if (this.withoutProject()) {
      customerCtrl.setValidators([Validators.required, Validators.min(1)]);
      projectCtrl.clearValidators();
    } else {
      projectCtrl.setValidators([Validators.required, Validators.min(1)]);
      customerCtrl.clearValidators();
    }
    customerCtrl.updateValueAndValidity({ emitEvent: false });
    projectCtrl.updateValueAndValidity({ emitEvent: false });
  }

  private initialWithoutProject(): boolean {
    if (this.editRow) {
      return this.editRow.projectId == null;
    }
    if (this.presetProjectId()) {
      return false;
    }
    if (this.presetCustomerId() && !this.presetProjectId()) {
      return true;
    }
    return false;
  }

  private initialSelectedProject(): Project | FollowUpProjectSummary | null {
    if (this.editRow?.projectId != null) {
      return (
        this.editRow.project ?? {
          id: this.editRow.projectId,
          code: null,
          name: `#${this.editRow.projectId}`,
        }
      );
    }
    const preset = this.data && !isFollowUpRow(this.data) ? this.data : null;
    if (preset?.projectId) {
      return (
        preset.project ?? {
          id: preset.projectId,
          code: null,
          name: `#${preset.projectId}`,
        }
      );
    }
    return null;
  }

  private initialProjectId(): number | null {
    return this.initialSelectedProject()?.id ?? null;
  }

  onCustomerPicked(option: PickerOption | null): void {
    this.customerOption.set(option);
    this.form.patchValue({ customerId: option?.id ?? 0 });
    this.error.set(null);
  }

  private initialCustomerOption(): PickerOption | null {
    if (this.editRow?.customer) {
      return { id: this.editRow.customer.id, label: this.editRow.customer.name };
    }
    const id = this.editRow?.customerId ?? this.presetCustomerId();
    if (!id) {
      return null;
    }
    const presetName = this.data && !isFollowUpRow(this.data) ? this.data.customerName : null;
    const cached = this.customersApi.getCustomer(id);
    return { id, label: presetName ?? cached?.name ?? `ลูกค้า #${id}` };
  }

  private initialCustomerId(): number {
    if (this.editRow) {
      return this.editRow.customerId;
    }
    return this.presetCustomerId() ?? 0;
  }

  private presetCustomerId(): number | undefined {
    if (!this.data || isFollowUpRow(this.data)) {
      return undefined;
    }
    return this.data.customerId;
  }

  private presetProjectId(): number | undefined {
    if (!this.data || isFollowUpRow(this.data)) {
      return undefined;
    }
    return this.data.projectId;
  }
}
