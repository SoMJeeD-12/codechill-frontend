import { DatePipe } from '@angular/common';
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
  WARRANTY_COVERAGE_LABELS,
  WARRANTY_NEAR_EXPIRY_DAYS,
  WARRANTY_STATUS_LABELS,
  Warranty,
  WarrantyCoverage,
  WarrantyStatus,
} from '../../core/models/warranty.model';
import { CustomerService } from '../../core/services/customer.service';
import { ProjectService } from '../../core/services/project.service';
import { WarrantyInput, WarrantyService } from '../../core/services/warranty.service';
import { parseDateOnly, toDateOnlyString } from '../../core/utils/date.util';

@Component({
  selector: 'app-warranties-page',
  standalone: true,
  imports: [
    DatePipe,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatButtonToggleModule,
    MatDialogModule,
    MatSnackBarModule,
  ],
  templateUrl: './warranties-page.component.html',
  styleUrl: './warranties-page.component.scss',
})
export class WarrantiesPageComponent implements OnInit {
  private readonly api = inject(WarrantyService);
  private readonly customersApi = inject(CustomerService);
  private readonly projectsApi = inject(ProjectService);
  private readonly dialog = inject(MatDialog);

  readonly warranties = signal<Warranty[]>([]);
  readonly view = signal<'near' | 'active' | 'all'>('near');
  readonly coverageLabels = WARRANTY_COVERAGE_LABELS;
  readonly statusLabels = WARRANTY_STATUS_LABELS;
  readonly nearDays = WARRANTY_NEAR_EXPIRY_DAYS;
  readonly columns = [
    'title',
    'customer',
    'coverage',
    'period',
    'daysLeft',
    'status',
    'actions',
  ];

  readonly filtered = computed(() => {
    const list = this.warranties();
    const view = this.view();
    if (view === 'near') {
      const nearIds = new Set(this.api.listNearExpiry().map((w) => w.id));
      return list.filter((w) => nearIds.has(w.id));
    }
    if (view === 'active') {
      return list.filter((w) => w.status === 'ACTIVE');
    }
    return list;
  });

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.api.list().subscribe((list) => this.warranties.set(list));
  }

  customerName(id: number): string {
    return this.customersApi.getCustomer(id)?.name ?? `#${id}`;
  }

  daysLeft(w: Warranty): string {
    const days = this.api.daysUntilExpiry(w);
    if (days === null) {
      return '—';
    }
    if (days < 0) {
      return `หมดแล้ว ${Math.abs(days)} วัน`;
    }
    if (days === 0) {
      return 'หมดวันนี้';
    }
    return `${days} วัน`;
  }

  isNear(w: Warranty): boolean {
    const days = this.api.daysUntilExpiry(w);
    return days !== null && days >= 0 && days <= this.nearDays && w.status === 'ACTIVE';
  }

  coverageLabel(coverage: Warranty['coverage']): string {
    return this.coverageLabels[coverage];
  }

  statusLabel(status: Warranty['status']): string {
    return this.statusLabels[status];
  }

  projectCode(id: number | null): string {
    if (!id) {
      return '—';
    }
    return this.projectsApi.getProject(id)?.code ?? `#${id}`;
  }

  openCreate(row?: Warranty): void {
    const ref = this.dialog.open(WarrantyFormDialogComponent, {
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
  selector: 'app-warranty-form-dialog',
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
  ],
  templateUrl: './warranty-form-dialog.component.html',
  styleUrl: './warranty-form-dialog.component.scss',
})
export class WarrantyFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(WarrantyService);
  private readonly customersApi = inject(CustomerService);
  private readonly projectsApi = inject(ProjectService);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject(MatDialogRef<WarrantyFormDialogComponent, boolean>);
  readonly data = inject<Warranty | null>(MAT_DIALOG_DATA);

  readonly customers = this.customersApi.customers;
  readonly projects = this.projectsApi.projects;
  readonly coverageLabels = WARRANTY_COVERAGE_LABELS;
  readonly coverages = Object.keys(WARRANTY_COVERAGE_LABELS) as WarrantyCoverage[];
  readonly statusLabels = WARRANTY_STATUS_LABELS;
  readonly statuses = Object.keys(WARRANTY_STATUS_LABELS) as WarrantyStatus[];
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.group({
    customerId: [this.data?.customerId ?? 0, Validators.min(1)],
    projectId: [this.data?.projectId ?? (null as number | null)],
    title: [this.data?.title ?? '', Validators.required],
    coverage: [(this.data?.coverage ?? 'SOFTWARE') as WarrantyCoverage],
    startDate: [parseDateOnly(this.data?.startDate) as Date | null, Validators.required],
    endDate: [parseDateOnly(this.data?.endDate) as Date | null, Validators.required],
    status: [(this.data?.status ?? 'ACTIVE') as WarrantyStatus],
    note: [this.data?.note ?? ''],
  });

  constructor() {
    if (!this.data) {
      const first = this.customers()[0];
      if (first) {
        this.form.patchValue({ customerId: first.id });
      }
    }
  }

  filteredProjects() {
    const customerId = this.form.getRawValue().customerId;
    return this.projects().filter((p) => p.customerId === customerId);
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const payload: WarrantyInput = {
      customerId: Number(raw.customerId),
      projectId: raw.projectId,
      deliveryId: this.data?.deliveryId ?? null,
      title: raw.title ?? '',
      coverage: (raw.coverage as WarrantyCoverage) ?? 'SOFTWARE',
      startDate: toDateOnlyString(raw.startDate),
      endDate: toDateOnlyString(raw.endDate),
      status: (raw.status as WarrantyStatus) ?? 'ACTIVE',
      note: raw.note ?? '',
    };
    this.saving.set(true);
    this.error.set(null);
    const req = this.data
      ? this.api.update(this.data.id, payload)
      : this.api.create(payload);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.snack.open(this.data ? 'บันทึกประกันแล้ว' : 'สร้างประกันแล้ว', 'ปิด', {
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
