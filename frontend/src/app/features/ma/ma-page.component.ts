import { Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
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
  MA_BILLING_CYCLE_LABELS,
  MA_EDITABLE_STATUSES,
  MA_STATUS_LABELS,
  MaBillingCycle,
  MaContract,
  MaContractStatus,
  MaCoverageState,
  MaEditableStatus,
  MaQuotaStatus,
  maCoverageDaysHint,
  maCoverageLabel,
  maPlanDisplayName,
  resolveMaCoverageState,
} from '../../core/models/ma.model';
import { AuthService } from '../../core/services/auth.service';
import { CustomerService } from '../../core/services/customer.service';
import {
  MaContractCreateInput,
  MaContractUpdateInput,
  MaService,
} from '../../core/services/ma.service';
import { ProjectService } from '../../core/services/project.service';
import { Project } from '../../core/models/project.model';
import {
  addDays,
  contractEndFromDuration,
  contractMonthCount,
  parseDateOnly,
  toDateOnlyString,
} from '../../core/utils/date.util';
import { parseMoneyValue, toMoneyString } from '../../core/utils/money.util';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { BahtPipe } from '../../shared/pipes/baht.pipe';
import { MoneyInputDirective } from '../../shared/directives/money-input.directive';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { openConfirmDialog } from '../../shared/components/confirm-dialog.component';
import { createClientPager } from '../../shared/utils/client-pager';
import { FORM_DIALOG_WIDE } from '../../shared/utils/form-dialog';
import { createTableSort } from '../../shared/utils/table-sort';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

type MaDurationPreset = 6 | 12 | 24 | 'CUSTOM';

function isEditableStatus(status: MaContractStatus): status is MaEditableStatus {
  return (MA_EDITABLE_STATUSES as MaContractStatus[]).includes(status);
}

@Component({
  selector: 'app-ma-page',
  standalone: true,
  imports: [
    ThaiDatePipe,
    BahtPipe,
    RouterLink,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatButtonToggleModule,
    MatDialogModule,
    MatSnackBarModule,
    MatMenuModule,
    TablePaginatorComponent,
  ],
  templateUrl: './ma-page.component.html',
  styleUrl: './ma-page.component.scss',
})
export class MaPageComponent implements OnInit {
  private readonly api = inject(MaService);
  private readonly customersApi = inject(CustomerService);
  private readonly projectsApi = inject(ProjectService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  readonly canCreate = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('ma.create');
  });
  readonly canUpdate = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('ma.update');
  });
  readonly canRenew = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('ma.renew');
  });

  readonly contracts = signal<MaContract[]>([]);
  /** โควตารอบปัจจุบัน — list API ไม่พ่วง ต้องโหลด GET /ma-contracts/:id/quota */
  readonly quotasById = signal<Record<number, MaQuotaStatus>>({});
  readonly quotasLoading = signal(false);
  /** ค่าเริ่มต้น = ทั้งหมด — สัญญาใหม่มักเป็น DRAFT จึงไม่ผ่านแท็บใช้งานอยู่ */
  readonly view = signal<'active' | 'all'>('all');
  readonly search = signal('');
  readonly searchControl = this.fb.nonNullable.control('');
  readonly statusLabels = MA_STATUS_LABELS;
  readonly columns = [
    'id',
    'project',
    'plan',
    'period',
    'quota',
    'fee',
    'status',
    'actions',
  ];

  readonly tableSort = createTableSort<
    'id' | 'project' | 'plan' | 'period' | 'quota' | 'fee' | 'status'
  >('id');

  readonly filtered = computed(() => {
    const list = this.contracts();
    let rows =
      this.view() === 'active'
        ? list.filter((c) => this.isActiveViewRow(c))
        : list;
    const q = this.search().trim().toLowerCase();
    if (q) {
      rows = rows.filter((c) => {
        return (
          String(c.id).includes(q) ||
          (c.contractNo ?? '').toLowerCase().includes(q) ||
          maPlanDisplayName(c).toLowerCase().includes(q) ||
          this.customerName(c).toLowerCase().includes(q) ||
          this.projectName(c).toLowerCase().includes(q) ||
          this.statusLabel(c.status).toLowerCase().includes(q) ||
          this.coverageLabel(c).toLowerCase().includes(q) ||
          (c.note ?? '').toLowerCase().includes(q)
        );
      });
    }
    return this.tableSort.apply(rows, (row, key) => {
      switch (key) {
        case 'id':
          return row.contractNo?.trim() || String(row.id);
        case 'project':
          return this.projectName(row);
        case 'plan':
          return this.planName(row);
        case 'period':
          return row.endDate ?? row.startDate ?? '';
        case 'quota':
          return this.remaining(row);
        case 'fee':
          return Number(row.price) || 0;
        case 'status':
          return this.coverageLabel(row);
      }
    });
  });

  readonly pager = createClientPager(this.filtered);

  /** แท็บใช้งานอยู่: ใช้ isCurrentlyActive ถ้ามี ไม่งั้น fallback status ACTIVE */
  private isActiveViewRow(c: MaContract): boolean {
    if (typeof c.isCurrentlyActive === 'boolean') {
      return c.isCurrentlyActive;
    }
    return c.status === 'ACTIVE';
  }
  ngOnInit(): void {
    this.searchControl.valueChanges.subscribe((v) => this.search.set(v));
    this.customersApi.listCustomers().subscribe({ error: () => undefined });
    this.projectsApi.listProjects().subscribe({ error: () => undefined });
    this.api.listPlans({ isActive: true }).subscribe({ error: () => undefined });
    this.reload();
  }

  reload(): void {
    this.api.list().subscribe({
      next: (list) => {
        this.contracts.set(list);
        this.loadQuotasForList(list);
      },
      error: () => {
        this.contracts.set([]);
        this.quotasById.set({});
      },
    });
  }

  private loadQuotasForList(list: MaContract[]): void {
    const targets = list.filter(
      (c) => c.status !== 'DRAFT' && c.status !== 'CANCELLED'
    );
    if (!targets.length) {
      this.quotasById.set({});
      this.quotasLoading.set(false);
      return;
    }
    this.quotasLoading.set(true);
    forkJoin(
      targets.map((c) =>
        this.api.getQuota(c.id).pipe(
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
        this.quotasById.set(next);
        this.quotasLoading.set(false);
      },
      error: () => {
        this.quotasById.set({});
        this.quotasLoading.set(false);
      },
    });
  }

  customerName(c: MaContract): string {
    return c.customerName ?? this.customersApi.getCustomer(c.customerId)?.name ?? `#${c.customerId}`;
  }

  projectName(c: MaContract): string {
    if (c.projectName?.trim()) {
      return c.projectName.trim();
    }
    const project = this.projectsApi.getProject(c.projectId);
    if (project) {
      return project.name;
    }
    return c.projectId ? `โปรเจกต์ #${c.projectId}` : '—';
  }

  /** โชว์เลขที่สัญญา ถ้าไม่มีใช้ #id */
  contractLabel(c: MaContract): string {
    const no = c.contractNo?.trim();
    return no || `#${c.id}`;
  }

  planName(c: MaContract): string {
    return maPlanDisplayName(c);
  }

  remaining(c: MaContract): number | null {
    const q = this.quotasById()[c.id] ?? c.quota;
    return q?.remaining ?? null;
  }

  quotaLabel(c: MaContract): string {
    if (c.status === 'DRAFT') {
      return '— (แบบร่าง)';
    }
    if (c.status === 'CANCELLED') {
      return '—';
    }
    const q = this.quotasById()[c.id] ?? c.quota ?? null;
    if (!q) {
      return this.quotasLoading() ? 'กำลังโหลด…' : '—';
    }
    return `ใช้แล้ว ${q.used}/${q.quota}`;
  }

  statusLabel(status: MaContract['status']): string {
    return this.statusLabels[status];
  }

  coverageStateOf(contract: MaContract): MaCoverageState {
    return resolveMaCoverageState(contract);
  }

  coverageLabel(contract: MaContract): string {
    return maCoverageLabel(contract);
  }

  coverageDaysHint(contract: MaContract): string | null {
    return maCoverageDaysHint(contract);
  }

  toggleSort(key: 'id' | 'project' | 'plan' | 'period' | 'quota' | 'fee' | 'status'): void {
    this.tableSort.toggleSort(key);
    this.pager.reset();
  }

  sortIcon(key: 'id' | 'project' | 'plan' | 'period' | 'quota' | 'fee' | 'status'): string {
    return this.tableSort.sortIcon(key);
  }

  openCreate(row?: MaContract): void {
    if (row ? !this.canUpdate() : !this.canCreate()) {
      this.snack.open(
        row ? 'ไม่มีสิทธิ์แก้ไขสัญญา MA' : 'ไม่มีสิทธิ์สร้างสัญญา MA',
        'ปิด',
        { duration: 3000 }
      );
      return;
    }
    const ref = this.dialog.open(MaFormDialogComponent, {
      ...FORM_DIALOG_WIDE,
      data: row ?? null,
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.reload();
      }
    });
  }

  remove(row: MaContract): void {
    const label =
      row.contractNo?.trim() ||
      this.projectName(row) ||
      `สัญญา #${row.id}`;
    openConfirmDialog(this.dialog, {
      title: 'ลบสัญญา MA',
      message: `ต้องการลบ「${label}」หรือไม่? (ใช้สำหรับเทส)`,
      confirmLabel: 'ลบ',
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.api.remove(row.id).subscribe({
        next: () => {
          this.snack.open('ลบสัญญาแล้ว', 'ปิด', { duration: 2500 });
          this.reload();
        },
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 4000 }),
      });
    });
  }
}

export type MaFormDialogData =
  | MaContract
  | { projectId?: number; customerId?: number }
  | null;

@Component({
  selector: 'app-ma-form-dialog',
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
    MoneyInputDirective,
  ],
  templateUrl: './ma-form-dialog.component.html',
  styleUrl: './ma-form-dialog.component.scss',
})
export class MaFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(MaService);
  private readonly customersApi = inject(CustomerService);
  private readonly projectsApi = inject(ProjectService);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject(MatDialogRef<MaFormDialogComponent, boolean>);
  /** สร้างใหม่ส่ง `{ projectId, customerId }` ได้ · แก้ไขส่ง MaContract */
  readonly data = inject<MaFormDialogData>(MAT_DIALOG_DATA);
  /** แถวแก้สัญญา — null ตอนสร้างใหม่ / preset */
  private readonly editRow: MaContract | null =
    this.data && 'id' in this.data && this.data.id ? this.data : null;

  readonly customers = this.customersApi.customers;
  /** โปรเจกต์ของลูกค้าที่เลือก — GET ?customerId= · รวม CLOSED */
  readonly customerProjects = signal<Project[]>([]);
  readonly plans = this.api.plans;
  readonly statusLabels = MA_STATUS_LABELS;
  readonly billingLabels = MA_BILLING_CYCLE_LABELS;
  readonly statuses = MA_EDITABLE_STATUSES;
  readonly billingCycles = Object.keys(MA_BILLING_CYCLE_LABELS) as MaBillingCycle[];
  readonly durationOptions: Array<{ value: MaDurationPreset; label: string }> = [
    { value: 6, label: '6 เดือน' },
    { value: 12, label: '12 เดือน' },
    { value: 24, label: '24 เดือน' },
    { value: 'CUSTOM', label: 'กำหนดเอง' },
  ];
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly isEdit = !!this.editRow;
  /**
   * สัญญาที่ระบบตั้งสถานะเอง (หมดอายุ / ต่อสัญญาแล้ว) — โชว์เป็นป้ายอ่านอย่างเดียว
   * ไม่ใส่ใน dropdown และไม่ส่ง status ถ้าผู้ใช้ไม่เลือกใหม่
   */
  readonly lockedStatus: MaContractStatus | null =
    this.editRow && !isEditableStatus(this.editRow.status) ? this.editRow.status : null;
  private readonly initialStatus: MaEditableStatus | null = this.editRow
    ? isEditableStatus(this.editRow.status)
      ? this.editRow.status
      : null
    : 'DRAFT';
  readonly status = signal<MaEditableStatus | null>(this.initialStatus);
  readonly billingCycle = signal<MaBillingCycle>(this.editRow?.billingCycle ?? 'YEARLY');
  readonly minEndDate = signal<Date | null>(null);
  readonly availableDurationOptions = computed(() =>
    this.billingCycle() === 'YEARLY'
      ? this.durationOptions.filter((opt) => opt.value !== 6)
      : this.durationOptions
  );

  private readonly initialDuration = this.inferDurationPreset(
    this.editRow?.startDate,
    this.editRow?.endDate
  );

  readonly form = this.fb.group(
    {
      customerId: [
        {
          value: this.editRow?.customerId ?? this.data?.customerId ?? 0,
          disabled: this.isEdit,
        },
        Validators.min(1),
      ],
      projectId: [
        {
          value: this.editRow?.projectId ?? this.data?.projectId ?? (null as number | null),
          disabled: this.isEdit,
        },
        Validators.required,
      ],
      planId: [this.editRow?.planId ?? (null as number | null), Validators.required],
      durationMonths: [this.initialDuration as MaDurationPreset],
      startDate: [parseDateOnly(this.editRow?.startDate) as Date | null, Validators.required],
      endDate: [parseDateOnly(this.editRow?.endDate) as Date | null, Validators.required],
      status: [this.initialStatus],
      price: [parseMoneyValue(this.editRow?.price) ?? 0, [Validators.required, Validators.min(0)]],
      billingCycle: [(this.editRow?.billingCycle ?? 'YEARLY') as MaBillingCycle],
      signedDate: [parseDateOnly(this.editRow?.signedDate) as Date | null],
      note: [this.editRow?.note ?? ''],
    },
    { validators: [MaFormDialogComponent.endAfterStart] }
  );

  constructor() {
    this.api.listPlans({ isActive: true }).subscribe();
    if (!this.customers().length) {
      this.customersApi.listCustomers().subscribe();
    }
    if (!this.isEdit) {
      const preset = this.data?.customerId;
      const first = this.customers()[0];
      this.form.patchValue({ customerId: preset ?? first?.id ?? 0 });
      if (preset) {
        this.form.controls.customerId.disable({ emitEvent: false });
      }
      const firstPlan = this.plans()[0];
      if (firstPlan) {
        this.form.patchValue({ planId: firstPlan.id });
      }
      if (!this.form.controls.startDate.value) {
        this.form.patchValue({ startDate: new Date() });
      }
      // จากฟอร์มประกัน — ล็อกโปรเจกต์/ลูกค้าตามที่ส่งมา
      const presetProjectId = this.data?.projectId;
      if (presetProjectId) {
        const applyProject = (p: { id: number; customerId: number }) => {
          this.form.patchValue({
            projectId: p.id,
            customerId: p.customerId,
          });
          this.form.controls.projectId.disable({ emitEvent: false });
          this.form.controls.customerId.disable({ emitEvent: false });
          this.loadCustomerProjects(p.customerId);
        };
        const cached = this.projectsApi.getProject(presetProjectId);
        if (cached) {
          applyProject(cached);
        } else {
          this.projectsApi.fetchProject(presetProjectId).subscribe({
            next: applyProject,
            error: () => {
              this.form.patchValue({ projectId: presetProjectId });
              this.loadCustomerProjects(Number(this.form.getRawValue().customerId) || 0);
            },
          });
        }
      } else {
        this.loadCustomerProjects(Number(this.form.getRawValue().customerId) || 0);
      }
    } else {
      this.loadCustomerProjects(Number(this.form.getRawValue().customerId) || 0);
    }

    this.form.controls.customerId.valueChanges.subscribe((customerId) => {
      if (this.isEdit || this.form.controls.projectId.disabled) {
        return;
      }
      this.form.patchValue({ projectId: null });
      this.loadCustomerProjects(Number(customerId) || 0);
    });

    this.syncEndDateEditability();
    this.ensureDurationMatchesBilling();
    this.recalcEndFromDuration();
    this.refreshMinEndDate();

    this.form.controls.status.valueChanges.subscribe((value) => {
      this.status.set(value ?? null);
    });
    this.form.controls.durationMonths.valueChanges.subscribe(() => {
      this.syncEndDateEditability();
      this.recalcEndFromDuration();
    });
    this.form.controls.startDate.valueChanges.subscribe(() => {
      this.refreshMinEndDate();
      this.recalcEndFromDuration();
    });
    this.form.controls.billingCycle.valueChanges.subscribe((value) => {
      if (value) {
        this.billingCycle.set(value);
      }
      this.ensureDurationMatchesBilling();
    });
  }

  filteredProjects() {
    return this.customerProjects();
  }

  private loadCustomerProjects(customerId: number): void {
    if (!customerId) {
      this.customerProjects.set([]);
      return;
    }
    this.projectsApi.listProjectsByCustomer(customerId).subscribe({
      next: (rows) => this.customerProjects.set(rows),
      error: () => this.customerProjects.set([]),
    });
  }

  isCustomDuration(): boolean {
    return this.form.controls.durationMonths.value === 'CUSTOM';
  }

  durationMonthCount(): number {
    const duration = this.form.controls.durationMonths.value;
    if (duration === 6 || duration === 12 || duration === 24) {
      return duration;
    }
    const { startDate, endDate } = this.form.getRawValue();
    return contractMonthCount(startDate, endDate);
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      if (this.form.hasError('endBeforeStart')) {
        this.error.set('วันสิ้นสุดสัญญาต้องอยู่หลังวันเริ่มสัญญา');
      }
      return;
    }
    const raw = this.form.getRawValue();
    const start = toDateOnlyString(raw.startDate);
    const end = toDateOnlyString(raw.endDate);
    if (!start || !end || end <= start) {
      this.error.set('วันสิ้นสุดสัญญาต้องอยู่หลังวันเริ่มสัญญา');
      return;
    }
    if (raw.billingCycle === 'YEARLY' && this.durationMonthCount() < 12) {
      this.error.set('รอบวางบิลรายปีต้องมีระยะสัญญาอย่างน้อย 12 เดือน');
      return;
    }

    this.saving.set(true);
    this.error.set(null);

    if (this.isEdit && this.editRow) {
      const pickedStatus = raw.status as MaEditableStatus | null;
      const payload: MaContractUpdateInput = {
        planId: Number(raw.planId),
        price: toMoneyString(raw.price),
        billingCycle: raw.billingCycle as MaBillingCycle,
        startDate: start,
        endDate: end,
        status:
          pickedStatus && pickedStatus !== this.initialStatus ? pickedStatus : undefined,
        signedDate: raw.signedDate ? toDateOnlyString(raw.signedDate) : null,
        note: raw.note?.trim() || null,
      };
      this.api.update(this.editRow.id, payload).subscribe({
        next: ({ contract, message }) => {
          this.saving.set(false);
          // สถานะจริงมาจาก response — สัญญาที่เลยวันสิ้นสุดจะกลายเป็นหมดอายุทันที
          const statusText = `สถานะ「${maCoverageLabel(contract)}」`;
          const text = message?.trim()
            ? `${message.trim()} · ${statusText}`
            : `บันทึกสัญญาแล้ว · ${statusText}`;
          this.snack.open(text, 'ปิด', { duration: message ? 6000 : 3500 });
          this.ref.close(true);
        },
        error: (err: Error) => {
          this.saving.set(false);
          this.error.set(err.message);
          if (err.message.includes('โควตา') || err.message.includes('409')) {
            this.snack.open(
              'แก้วันเริ่ม/แผนไม่ได้เมื่อหักโควตาแล้ว — ยกเลิกแล้วสร้างฉบับใหม่แทน',
              'ปิด',
              { duration: 5000 }
            );
          }
        },
      });
      return;
    }

    const payload: MaContractCreateInput = {
      projectId: Number(raw.projectId),
      planId: Number(raw.planId),
      price: toMoneyString(raw.price),
      billingCycle: raw.billingCycle as MaBillingCycle,
      startDate: start,
      endDate: end,
      status: (raw.status as MaEditableStatus | null) ?? 'DRAFT',
      signedDate: raw.signedDate ? toDateOnlyString(raw.signedDate) : null,
      note: raw.note?.trim() || null,
    };
    this.api.create(payload).subscribe({
      next: ({ contract, message }) => {
        this.saving.set(false);
        const no = contract.contractNo?.trim();
        const text =
          message?.trim() ||
          (no ? `สร้างสัญญาแล้ว · ${no}` : 'สร้างสัญญาแล้ว');
        this.snack.open(text, 'ปิด', { duration: message || no ? 5000 : 2500 });
        this.ref.close(true);
      },
      error: (err: Error) => {
        this.saving.set(false);
        this.error.set(err.message);
      },
    });
  }

  private ensureDurationMatchesBilling(): void {
    if (this.form.controls.billingCycle.value !== 'YEARLY') {
      return;
    }
    if (this.form.controls.durationMonths.value === 6) {
      this.form.controls.durationMonths.setValue(12);
    }
  }

  private syncEndDateEditability(): void {
    if (this.isCustomDuration()) {
      this.form.controls.endDate.enable({ emitEvent: false });
    } else {
      this.form.controls.endDate.disable({ emitEvent: false });
    }
  }

  private refreshMinEndDate(): void {
    const start = this.form.controls.startDate.value;
    this.minEndDate.set(start ? addDays(start, 1) : null);
  }

  private recalcEndFromDuration(): void {
    if (this.isCustomDuration()) {
      return;
    }
    const start = this.form.controls.startDate.value;
    const duration = this.form.controls.durationMonths.value;
    if (!start || (duration !== 6 && duration !== 12 && duration !== 24)) {
      return;
    }
    const end = contractEndFromDuration(start, duration);
    this.form.controls.endDate.setValue(end, { emitEvent: false });
  }

  private inferDurationPreset(
    start: string | null | undefined,
    end: string | null | undefined
  ): MaDurationPreset {
    if (!start || !end) {
      return 12;
    }
    const months = contractMonthCount(start, end);
    if (months === 6 || months === 12 || months === 24) {
      return months;
    }
    return 'CUSTOM';
  }

  private static endAfterStart(group: AbstractControl): ValidationErrors | null {
    const start = group.get('startDate')?.value as Date | null;
    const end = group.get('endDate')?.value as Date | null;
    if (!start || !end) {
      return null;
    }
    const s = start instanceof Date ? start : parseDateOnly(start);
    const e = end instanceof Date ? end : parseDateOnly(end);
    if (!s || !e) {
      return null;
    }
    const sDay = new Date(s.getFullYear(), s.getMonth(), s.getDate()).getTime();
    const eDay = new Date(e.getFullYear(), e.getMonth(), e.getDate()).getTime();
    return eDay > sDay ? null : { endBeforeStart: true };
  }
}
