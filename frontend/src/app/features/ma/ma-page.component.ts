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
import { MA_STATUS_LABELS, MaContract, MaContractStatus } from '../../core/models/ma.model';
import { CustomerService } from '../../core/services/customer.service';
import { MaContractInput, MaService } from '../../core/services/ma.service';
import { ProjectService } from '../../core/services/project.service';
import { parseDateOnly, toDateOnlyString } from '../../core/utils/date.util';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { BahtPipe } from '../../shared/pipes/baht.pipe';

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
  readonly view = signal<'active' | 'all'>('active');
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
    let rows = this.view() === 'active' ? list.filter((c) => c.status === 'ACTIVE') : list;
    const q = this.search().trim().toLowerCase();
    if (!q) {
      return rows;
    }
    return rows.filter((c) => {
      const project = c.projectId != null ? this.projectsApi.getProject(c.projectId) : null;
      const projectText = project ? `${project.code} ${project.name}`.toLowerCase() : '';
      return (
        c.contractNo?.toLowerCase().includes(q) ||
        c.planName.toLowerCase().includes(q) ||
        this.customerName(c.customerId).toLowerCase().includes(q) ||
        projectText.includes(q) ||
        this.statusLabel(c.status).toLowerCase().includes(q) ||
        (c.note ?? '').toLowerCase().includes(q)
      );
    });
  });

  ngOnInit(): void {
    this.searchControl.valueChanges.subscribe((v) => this.search.set(v));
    this.customersApi.listCustomers().subscribe({
      next: (customers) => {
        this.projectsApi.listProjects().subscribe({
          next: (projects) => {
            const first = customers[0];
            if (first) {
              const projectIds = projects
                .filter((p) => p.customerId === first.id)
                .map((p) => p.id);
              this.api.ensureDemoSeed(first.id, projectIds).subscribe((list) => {
                this.contracts.set(list);
              });
            } else {
              this.reload();
            }
          },
          error: () => this.reload(),
        });
      },
      error: () => this.reload(),
    });
    this.api.listPlans().subscribe();
  }

  reload(): void {
    this.api.list().subscribe((list) => this.contracts.set(list));
  }

  customerName(id: number): string {
    return this.customersApi.getCustomer(id)?.name ?? `#${id}`;
  }

  remaining(c: MaContract): number {
    return this.api.remainingQuota(c);
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

import { MoneyInputDirective } from '../../shared/directives/money-input.directive';

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
  readonly statuses = Object.keys(MA_STATUS_LABELS) as MaContractStatus[];
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.group({
    customerId: [this.data?.customerId ?? 0, Validators.min(1)],
    projectId: [this.data?.projectId ?? (null as number | null)],
    planId: [this.data?.planId ?? (null as number | null)],
    planName: [this.data?.planName ?? '', Validators.required],
    startDate: [parseDateOnly(this.data?.startDate) as Date | null, Validators.required],
    endDate: [parseDateOnly(this.data?.endDate) as Date | null, Validators.required],
    status: [(this.data?.status ?? 'ACTIVE') as MaContractStatus],
    annualFee: [this.data?.annualFee ?? 0, Validators.min(0)],
    quotaTotal: [this.data?.quotaTotal ?? 12, Validators.min(0)],
    slaHours: [this.data?.slaHours ?? 24, Validators.min(1)],
    note: [this.data?.note ?? ''],
  });

  constructor() {
    this.api.listPlans().subscribe();
    if (!this.data) {
      const first = this.customers()[0];
      const firstPlan = this.plans()[0];
      this.form.patchValue({
        customerId: first?.id ?? 0,
        planId: firstPlan?.id ?? null,
        planName: firstPlan?.name ?? '',
        annualFee: firstPlan?.defaultAnnualFee ?? 0,
        quotaTotal: firstPlan?.defaultQuotaTotal ?? 12,
        slaHours: firstPlan?.defaultSlaHours ?? 24,
      });
    }
  }

  filteredProjects() {
    const customerId = this.form.getRawValue().customerId;
    return this.projects().filter((p) => p.customerId === customerId);
  }

  onPlanChange(planId: number | null): void {
    const plan = planId != null ? this.api.getPlan(planId) : undefined;
    if (!plan) {
      return;
    }
    this.form.patchValue({
      planId: plan.id,
      planName: plan.name,
      annualFee: plan.defaultAnnualFee,
      quotaTotal: plan.defaultQuotaTotal,
      slaHours: plan.defaultSlaHours,
    });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const payload: MaContractInput = {
      customerId: Number(raw.customerId),
      projectId: raw.projectId,
      planId: raw.planId,
      planName: raw.planName ?? '',
      startDate: toDateOnlyString(raw.startDate),
      endDate: toDateOnlyString(raw.endDate),
      status: (raw.status as MaContractStatus) ?? 'ACTIVE',
      annualFee: Number(raw.annualFee) || 0,
      quotaTotal: Number(raw.quotaTotal) || 0,
      slaHours: Number(raw.slaHours) || 24,
      note: raw.note ?? '',
    };
    this.saving.set(true);
    this.error.set(null);
    const req = this.data ? this.api.update(this.data.id, payload) : this.api.create(payload);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.snack.open(this.data ? 'บันทึกสัญญาแล้ว' : 'สร้างสัญญาแล้ว', 'ปิด', {
          duration: 2500,
        });
        this.ref.close(true);
      },
      error: (err: Error) => {
        this.saving.set(false);
        this.error.set(err.message);
      },
    });
  }
}