import { Component, OnInit, computed, inject, signal } from '@angular/core';
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
import {
  MA_BILLING_CYCLE_LABELS,
  MA_STATUS_LABELS,
  MaBillingCycle,
  MaContract,
  MaContractStatus,
  maPlanDisplayName,
} from '../../core/models/ma.model';
import { CustomerService } from '../../core/services/customer.service';
import {
  MaContractCreateInput,
  MaContractUpdateInput,
  MaService,
} from '../../core/services/ma.service';
import { ProjectService } from '../../core/services/project.service';
import { parseDateOnly, toDateOnlyString } from '../../core/utils/date.util';
import { parseMoneyValue, toMoneyString } from '../../core/utils/money.util';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { BahtPipe } from '../../shared/pipes/baht.pipe';
import { MoneyInputDirective } from '../../shared/directives/money-input.directive';

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
  ],
  templateUrl: './ma-page.component.html',
  styleUrl: './ma-page.component.scss',
})
export class MaPageComponent implements OnInit {
  private readonly api = inject(MaService);
  private readonly customersApi = inject(CustomerService);
  private readonly projectsApi = inject(ProjectService);
  private readonly dialog = inject(MatDialog);
  private readonly fb = inject(FormBuilder);

  readonly contracts = signal<MaContract[]>([]);
  /** ค่าเริ่มต้น = ทั้งหมด — สัญญาใหม่มักเป็น DRAFT จึงไม่ผ่านแท็บใช้งานอยู่ */
  readonly view = signal<'active' | 'all'>('all');
  readonly search = signal('');
  readonly searchControl = this.fb.nonNullable.control('');
  readonly statusLabels = MA_STATUS_LABELS;
  readonly columns = [
    'contractNo',
    'plan',
    'customer',
    'period',
    'quota',
    'fee',
    'status',
    'actions',
  ];

  readonly filtered = computed(() => {
    const list = this.contracts();
    let rows =
      this.view() === 'active'
        ? list.filter((c) => this.isActiveViewRow(c))
        : list;
    const q = this.search().trim().toLowerCase();
    if (!q) {
      return rows;
    }
    return rows.filter((c) => {
      const project = this.projectsApi.getProject(c.projectId);
      const projectText = project
        ? `${project.code} ${project.name}`.toLowerCase()
        : (c.projectName ?? '').toLowerCase();
      return (
        c.contractNo?.toLowerCase().includes(q) ||
        maPlanDisplayName(c).toLowerCase().includes(q) ||
        this.customerName(c).toLowerCase().includes(q) ||
        projectText.includes(q) ||
        this.statusLabel(c.status).toLowerCase().includes(q) ||
        (c.note ?? '').toLowerCase().includes(q)
      );
    });
  });

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
    this.api.listPlans().subscribe({ error: () => undefined });
    this.reload();
  }

  reload(): void {
    this.api.list().subscribe({
      next: (list) => this.contracts.set(list),
      error: () => this.contracts.set([]),
    });
  }

  customerName(c: MaContract): string {
    return c.customerName ?? this.customersApi.getCustomer(c.customerId)?.name ?? `#${c.customerId}`;
  }

  planName(c: MaContract): string {
    return maPlanDisplayName(c);
  }

  remaining(c: MaContract): number {
    return this.api.remainingQuota(c);
  }

  quotaLabel(c: MaContract): string {
    const q = c.quota;
    if (!q) {
      return '—';
    }
    return `ใช้ ${q.used}/${q.quota} · เหลือ ${q.remaining}`;
  }

  statusLabel(status: MaContract['status']): string {
    return this.statusLabels[status];
  }

  openCreate(row?: MaContract): void {
    const ref = this.dialog.open(MaFormDialogComponent, {
      width: '560px',
      maxWidth: '95vw',
      data: row ?? null,
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.reload();
      }
    });
  }
}

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
  readonly data = inject<MaContract | null>(MAT_DIALOG_DATA);

  readonly customers = this.customersApi.customers;
  readonly projects = this.projectsApi.projects;
  readonly plans = this.api.plans;
  readonly statusLabels = MA_STATUS_LABELS;
  readonly billingLabels = MA_BILLING_CYCLE_LABELS;
  /** PATCH ตั้ง RENEWED ไม่ได้ — ไม่โชว์ในฟอร์ม */
  readonly statuses = (Object.keys(MA_STATUS_LABELS) as MaContractStatus[]).filter(
    (s) => s !== 'RENEWED'
  );
  readonly billingCycles = Object.keys(MA_BILLING_CYCLE_LABELS) as MaBillingCycle[];
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly isEdit = !!this.data;

  readonly form = this.fb.group({
    customerId: [
      {
        value: this.data?.customerId ?? 0,
        disabled: this.isEdit,
      },
      Validators.min(1),
    ],
    projectId: [
      {
        value: this.data?.projectId ?? (null as number | null),
        disabled: this.isEdit,
      },
      Validators.required,
    ],
    planId: [this.data?.planId ?? (null as number | null), Validators.required],
    startDate: [parseDateOnly(this.data?.startDate) as Date | null, Validators.required],
    endDate: [parseDateOnly(this.data?.endDate) as Date | null, Validators.required],
    status: [(this.data?.status === 'RENEWED' ? 'ACTIVE' : this.data?.status ?? 'DRAFT') as Exclude<MaContractStatus, 'RENEWED'>],
    price: [parseMoneyValue(this.data?.price) ?? 0, Validators.min(0)],
    billingCycle: [(this.data?.billingCycle ?? 'YEARLY') as MaBillingCycle],
    contractNo: [this.data?.contractNo ?? ''],
    signedDate: [parseDateOnly(this.data?.signedDate) as Date | null],
    note: [this.data?.note ?? ''],
  });

  constructor() {
    this.api.listPlans().subscribe();
    if (!this.projects().length) {
      this.projectsApi.listProjects().subscribe();
    }
    if (!this.customers().length) {
      this.customersApi.listCustomers().subscribe();
    }
    if (!this.data) {
      const first = this.customers()[0];
      this.form.patchValue({ customerId: first?.id ?? 0 });
      const firstPlan = this.plans()[0];
      if (firstPlan) {
        this.form.patchValue({ planId: firstPlan.id });
      }
    }
  }

  filteredProjects() {
    const customerId = this.form.getRawValue().customerId;
    return this.projects().filter((p) => p.customerId === customerId);
  }

  onPlanChange(_planId: number | null): void {
    /* ราคาตั้งที่สัญญา — ไม่ดึงจากแผน (BR-05) */
  }

  planHint(): string {
    const planId = this.form.getRawValue().planId;
    const plan = planId != null ? this.api.getPlan(planId) : undefined;
    if (!plan) {
      return '';
    }
    const sla = plan.responseTimeHour != null ? `SLA ${plan.responseTimeHour} ชม.` : 'ไม่มี SLA';
    return `โควตา ${plan.bugQuotaPerMonth} เคส/รอบ · ${sla}`;
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);

    if (this.data) {
      const payload: MaContractUpdateInput = {
        planId: Number(raw.planId),
        price: toMoneyString(raw.price),
        billingCycle: raw.billingCycle as MaBillingCycle,
        startDate: toDateOnlyString(raw.startDate),
        endDate: toDateOnlyString(raw.endDate),
        status: raw.status as Exclude<MaContractStatus, 'RENEWED'>,
        contractNo: raw.contractNo?.trim() || null,
        signedDate: raw.signedDate ? toDateOnlyString(raw.signedDate) : null,
        note: raw.note?.trim() || null,
      };
      this.api.update(this.data.id, payload).subscribe({
        next: () => {
          this.saving.set(false);
          this.snack.open('บันทึกสัญญาแล้ว', 'ปิด', { duration: 2500 });
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
      startDate: toDateOnlyString(raw.startDate),
      endDate: toDateOnlyString(raw.endDate),
      status: (raw.status as Exclude<MaContractStatus, 'RENEWED'>) ?? 'DRAFT',
      contractNo: raw.contractNo?.trim() || null,
      signedDate: raw.signedDate ? toDateOnlyString(raw.signedDate) : null,
      note: raw.note?.trim() || null,
    };
    this.api.create(payload).subscribe({
      next: ({ message }) => {
        this.saving.set(false);
        const text = message?.trim() || 'สร้างสัญญาแล้ว';
        this.snack.open(text, 'ปิด', { duration: message ? 6000 : 2500 });
        this.ref.close(true);
      },
      error: (err: Error) => {
        this.saving.set(false);
        this.error.set(err.message);
      },
    });
  }
}
