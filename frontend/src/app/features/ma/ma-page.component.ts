import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
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
  maContractEndDate,
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
import { addDays, parseDateOnly, toDateOnlyString } from '../../core/utils/date.util';
import { parseMoneyValue, toMoneyString } from '../../core/utils/money.util';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { BahtPipe } from '../../shared/pipes/baht.pipe';
import { MoneyInputDirective } from '../../shared/directives/money-input.directive';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import {
  EntityPickerComponent,
  PickerOption,
} from '../../shared/components/entity-picker.component';
import { customerPickerOption, customerSearchFn } from '../../shared/components/entity-search';
import { openConfirmDialog } from '../../shared/components/confirm-dialog.component';
import {
  ListLoadingBarComponent,
  ListSkeletonComponent,
} from '../../shared/components/list-loading.component';
import { FORM_DIALOG_WIDE } from '../../shared/utils/form-dialog';
import { createServerList } from '../../shared/utils/server-list';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

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
    ListLoadingBarComponent,
    ListSkeletonComponent,
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

  /**
   * แบ่งหน้าฝั่ง server (GET /ma-contracts) · ค่าเริ่มต้น = ทั้งหมด —
   * สัญญาใหม่มักเป็น DRAFT จึงไม่ผ่านแท็บใช้งานอยู่
   */
  readonly list = createServerList<MaContract, { view: 'active' | 'all' }>({
    namespace: 'ma-contracts',
    filters: { view: 'all' },
    sortBy: 'id',
    sortOrder: 'DESC',
    sortOrderFor: (key) => (key === 'price' ? 'DESC' : 'ASC'),
    fetch: ({ filters, ...req }) =>
      this.api.listPage({ ...req, status: filters.view === 'active' ? 'ACTIVE' : undefined }),
  });
  readonly view = computed(() => this.list.filters().view);
  readonly searchControl = this.list.searchControl;
  /** โควตารอบปัจจุบัน — list API ไม่พ่วง ต้องโหลด GET /ma-contracts/:id/quota (เฉพาะแถวในหน้า) */
  readonly quotasById = signal<Record<number, MaQuotaStatus>>({});
  readonly quotasLoading = signal(false);
  private readonly quotaTried = new Set<number>();
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

  constructor() {
    effect(() => {
      const rows = this.list.items();
      untracked(() => this.loadQuotasForList(rows));
    });
  }

  ngOnInit(): void {
    this.api.listPlans({ isActive: true }).subscribe({ error: () => undefined });
    this.list.start();
  }

  reload(): void {
    this.quotaTried.clear();
    this.list.reload({ invalidate: true });
  }

  private loadQuotasForList(list: MaContract[]): void {
    const targets = list.filter(
      (c) => c.status !== 'DRAFT' && c.status !== 'CANCELLED' && !this.quotaTried.has(c.id)
    );
    if (!targets.length) {
      return;
    }
    for (const c of targets) {
      this.quotaTried.add(c.id);
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
        const next: Record<number, MaQuotaStatus> = { ...this.quotasById() };
        for (const [id, q] of pairs) {
          if (q) {
            next[id] = q;
          }
        }
        this.quotasById.set(next);
        this.quotasLoading.set(false);
      },
      error: () => this.quotasLoading.set(false),
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

  /** เรียงฝั่ง server ได้เฉพาะคอลัมน์ตรงของสัญญา (id · endDate · price · status) */
  toggleSort(key: 'id' | 'endDate' | 'price' | 'status'): void {
    this.list.toggleSort(key);
  }

  sortIcon(key: 'id' | 'endDate' | 'price' | 'status'): string {
    return this.list.sortIcon(key);
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

  canCancel(row: MaContract): boolean {
    return this.canUpdate() && row.status !== 'CANCELLED' && row.status !== 'RENEWED';
  }

  /** ไม่มีการลบสัญญา — ยกเลิกด้วยสถานะ CANCELLED */
  cancelContract(row: MaContract): void {
    const label =
      row.contractNo?.trim() ||
      this.projectName(row) ||
      `สัญญา #${row.id}`;
    openConfirmDialog(this.dialog, {
      title: 'ยกเลิกสัญญา MA',
      message: `ต้องการยกเลิก「${label}」หรือไม่? สัญญาจะยังอยู่ในระบบด้วยสถานะ「ยกเลิก」`,
      confirmLabel: 'ยกเลิกสัญญา',
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.api.update(row.id, { status: 'CANCELLED' }).subscribe({
        next: () => {
          this.snack.open('ยกเลิกสัญญาแล้ว', 'ปิด', { duration: 2500 });
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
    ThaiDatePipe,
    EntityPickerComponent,
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

  readonly searchCustomers = customerSearchFn(this.customersApi);
  readonly customerOption = signal<PickerOption | null>(null);
  /** โปรเจกต์ของลูกค้าที่เลือก — GET ?customerId= · รวม CLOSED */
  readonly customerProjects = signal<Project[]>([]);
  readonly plans = this.api.plans;
  readonly statusLabels = MA_STATUS_LABELS;
  readonly billingLabels = MA_BILLING_CYCLE_LABELS;
  readonly statuses = MA_EDITABLE_STATUSES;
  readonly billingCycles = Object.keys(MA_BILLING_CYCLE_LABELS) as MaBillingCycle[];
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
  /** RENEWED ห้ามเปลี่ยนสถานะ — PATCH ที่มี status จะได้ 400 */
  readonly canChangeStatus = this.lockedStatus !== 'RENEWED';
  /**
   * true = ผู้ใช้กำหนดวันสิ้นสุดเอง (สัญญา 1 ปีแบ่งจ่ายรายเดือน / สัญญาเก่าจากกระดาษ)
   * false = ระบบคำนวณจากวันเริ่ม + รอบวางบิล
   */
  readonly manualEnd = signal(false);
  readonly minEndDate = signal<Date | null>(null);

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
      startDate: [parseDateOnly(this.editRow?.startDate) as Date | null, Validators.required],
      endDate: [parseDateOnly(this.editRow?.endDate) as Date | null, Validators.required],
      status: [this.initialStatus],
      price: [parseMoneyValue(this.editRow?.price) ?? 0, [Validators.required, Validators.min(0)]],
      billingCycle: [(this.editRow?.billingCycle ?? 'YEARLY') as MaBillingCycle],
      signedDate: [parseDateOnly(this.editRow?.signedDate) as Date | null],
      note: [this.editRow?.note ?? ''],
    }
  );

  constructor() {
    this.api.listPlans({ isActive: true }).subscribe();
    if (!this.isEdit) {
      const preset = this.data?.customerId;
      this.form.patchValue({ customerId: preset ?? 0 });
      if (preset) {
        this.form.controls.customerId.disable({ emitEvent: false });
        this.resolveCustomerOption(preset);
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
          this.resolveCustomerOption(p.customerId);
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

    // สัญญาเดิมที่วันสิ้นสุดไม่ตรงสูตร → เปิดโหมดแก้เองไว้ ห้ามคำนวณทับ
    const start = this.form.controls.startDate.value;
    const savedEnd = this.form.controls.endDate.value;
    if (this.isEdit && start && savedEnd) {
      const formula = maContractEndDate(start, this.form.controls.billingCycle.value ?? 'YEARLY');
      this.manualEnd.set(toDateOnlyString(formula) !== toDateOnlyString(savedEnd));
    }
    if (!this.manualEnd()) {
      this.recalcEnd();
    }
    this.refreshMinEnd();

    this.form.controls.status.valueChanges.subscribe((value) => {
      this.status.set(value ?? null);
    });
    this.form.controls.startDate.valueChanges.subscribe(() => {
      this.refreshMinEnd();
      if (!this.manualEnd()) {
        this.recalcEnd();
      }
    });
    this.form.controls.billingCycle.valueChanges.subscribe(() => {
      if (!this.manualEnd()) {
        this.recalcEnd();
      }
    });
  }

  /** ลิงก์「แก้วันสิ้นสุด」/「ใช้วันที่ระบบคำนวณ」 */
  toggleManualEnd(): void {
    const next = !this.manualEnd();
    this.manualEnd.set(next);
    if (!next) {
      this.recalcEnd();
    }
  }

  private recalcEnd(): void {
    const start = this.form.controls.startDate.value;
    const cycle = this.form.controls.billingCycle.value ?? 'YEARLY';
    this.form.controls.endDate.setValue(start ? maContractEndDate(start, cycle) : null, {
      emitEvent: false,
    });
  }

  private refreshMinEnd(): void {
    const start = this.form.controls.startDate.value;
    this.minEndDate.set(start ? addDays(start, 1) : null);
  }

  filteredProjects() {
    return this.customerProjects();
  }

  onCustomerPicked(option: PickerOption | null): void {
    this.customerOption.set(option);
    this.form.controls.customerId.setValue(option?.id ?? 0);
  }

  private resolveCustomerOption(customerId: number): void {
    if (!customerId || this.customerOption()?.id === customerId) {
      return;
    }
    const cached = this.customersApi.getCustomer(customerId);
    this.customerOption.set(
      cached ? customerPickerOption(cached) : { id: customerId, label: `ลูกค้า #${customerId}` }
    );
    if (!cached) {
      this.customersApi.fetchCustomer(customerId).subscribe({
        next: (c) => this.customerOption.set(customerPickerOption(c)),
        error: () => undefined,
      });
    }
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

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const start = toDateOnlyString(raw.startDate);
    const end = toDateOnlyString(raw.endDate);
    if (!start || !end || end <= start) {
      this.error.set('วันสิ้นสุดสัญญาต้องอยู่หลังวันเริ่มสัญญา');
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
          this.canChangeStatus && pickedStatus && pickedStatus !== this.initialStatus
            ? pickedStatus
            : undefined,
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
}
