import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
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
import { Delivery } from '../../core/models/project.model';
import {
  WARRANTY_NEAR_EXPIRY_DAYS,
  WARRANTY_STATUS_LABELS,
  Warranty,
  WarrantyStatus,
} from '../../core/models/warranty.model';
import { CustomerService } from '../../core/services/customer.service';
import { ProjectService } from '../../core/services/project.service';
import {
  WarrantyCreateInput,
  WarrantyService,
  WarrantyUpdateInput,
} from '../../core/services/warranty.service';

@Component({
  selector: 'app-warranties-page',
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
  ],
  templateUrl: './warranties-page.component.html',
  styleUrl: './warranties-page.component.scss',
})
export class WarrantiesPageComponent implements OnInit {
  private readonly api = inject(WarrantyService);
  private readonly customersApi = inject(CustomerService);
  private readonly projectsApi = inject(ProjectService);
  private readonly dialog = inject(MatDialog);
  private readonly fb = inject(FormBuilder);

  readonly warranties = signal<Warranty[]>([]);
  readonly view = signal<'near' | 'active' | 'all'>('all');
  readonly search = signal('');
  readonly searchControl = this.fb.nonNullable.control('');
  readonly statusLabels = WARRANTY_STATUS_LABELS;
  readonly nearDays = WARRANTY_NEAR_EXPIRY_DAYS;
  readonly columns = ['title', 'customer', 'period', 'daysLeft', 'status', 'actions'];
  private readonly snack = inject(MatSnackBar);

  readonly filtered = computed(() => {
    const list = this.warranties();
    const view = this.view();
    let rows = list;
    if (view === 'near') {
      rows = list.filter((w) => this.isNear(w));
    } else if (view === 'active') {
      rows = list.filter((w) => w.status === 'ACTIVE' || w.isCurrentlyActive);
    }
    const q = this.search().trim().toLowerCase();
    if (!q) {
      return rows;
    }
    return rows.filter((w) => {
      const projectName = (w.project?.name ?? '').toLowerCase();
      const customerName = (w.project?.customerName ?? this.customerName(w)).toLowerCase();
      const deliveryTitle = (w.delivery?.title ?? '').toLowerCase();
      return (
        projectName.includes(q) ||
        customerName.includes(q) ||
        deliveryTitle.includes(q) ||
        this.statusLabel(w.status).toLowerCase().includes(q) ||
        (w.scopeNote ?? '').toLowerCase().includes(q)
      );
    });
  });

  ngOnInit(): void {
    this.searchControl.valueChanges.subscribe((v) => this.search.set(v));
    this.customersApi.listCustomers().subscribe();
    this.projectsApi.listProjects().subscribe();
    this.reload();
  }

  reload(): void {
    this.api.list().subscribe({
      next: (list) => {
        this.warranties.set(list);
        // เติมรายการใกล้หมดอายุเข้า cache (ไม่ทับรายการทั้งหมด)
        this.api.listExpiring({ days: this.nearDays }).subscribe({
          next: () => this.warranties.set(this.api.warranties()),
          error: () => undefined,
        });
      },
      error: (err: Error) => {
        this.warranties.set([]);
        this.snack.open(err.message || 'โหลดประกันไม่สำเร็จ', 'ปิด', { duration: 3500 });
      },
    });
  }

  customerName(w: Warranty): string {
    if (w.project?.customerName) {
      return w.project.customerName;
    }
    const id = w.project?.customerId;
    return id ? this.customersApi.getCustomer(id)?.name ?? `#${id}` : '—';
  }

  customerId(w: Warranty): number | null {
    return w.project?.customerId ?? null;
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
    return (
      days !== null &&
      days >= 0 &&
      days <= this.nearDays &&
      (w.status === 'ACTIVE' || w.isCurrentlyActive)
    );
  }

  statusLabel(status: Warranty['status']): string {
    return this.statusLabels[status];
  }

  openCreate(row?: Warranty): void {
    const ref = this.dialog.open(WarrantyFormDialogComponent, {
      width: '560px',
      maxWidth: '95vw',
      data: row ?? null,
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.view.set('all');
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
  readonly deliveries = signal<Delivery[]>([]);
  readonly statusLabels = WARRANTY_STATUS_LABELS;
  readonly statuses = Object.keys(WARRANTY_STATUS_LABELS) as WarrantyStatus[];
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly isEdit = !!this.data;

  readonly form = this.fb.group({
    customerId: [this.data?.project?.customerId ?? 0, Validators.min(1)],
    projectId: [this.data?.projectId ?? (null as number | null), Validators.required],
    deliveryId: [this.data?.deliveryId ?? (null as number | null), Validators.required],
    durationMonth: [this.data?.durationMonth ?? 12, [Validators.required, Validators.min(1), Validators.max(120)]],
    status: [(this.data?.status ?? 'ACTIVE') as WarrantyStatus],
    scopeNote: [this.data?.scopeNote ?? ''],
  });

  constructor() {
    if (!this.data) {
      const first = this.customers()[0];
      if (first) {
        this.form.patchValue({ customerId: first.id });
      }
    } else {
      this.form.controls.customerId.disable();
      this.form.controls.projectId.disable();
      this.form.controls.deliveryId.disable();
    }

    this.form.controls.customerId.valueChanges.subscribe(() => {
      this.form.patchValue({ projectId: null, deliveryId: null });
      this.deliveries.set([]);
    });
    this.form.controls.projectId.valueChanges.subscribe((projectId) => {
      this.form.patchValue({ deliveryId: null });
      this.deliveries.set([]);
      if (projectId) {
        this.loadDeliveries(projectId);
      }
    });

    const projectId = this.form.getRawValue().projectId;
    if (projectId) {
      this.loadDeliveries(projectId);
    }
  }

  filteredProjects() {
    const customerId = this.form.getRawValue().customerId;
    return this.projects().filter((p) => p.customerId === customerId);
  }

  private loadDeliveries(projectId: number): void {
    this.projectsApi.listDeliveries(projectId).subscribe({
      next: (rows) => this.deliveries.set(rows),
      error: (err: Error) => this.error.set(err.message),
    });
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
      const payload: WarrantyUpdateInput = {
        durationMonth: Number(raw.durationMonth),
        status: (raw.status as WarrantyStatus) ?? 'ACTIVE',
        scopeNote: (raw.scopeNote ?? '').trim() || null,
      };
      this.api.update(this.data.id, payload).subscribe({
        next: () => this.onSaved(true),
        error: (err: Error) => this.onError(err),
      });
      return;
    }

    const payload: WarrantyCreateInput = {
      durationMonth: Number(raw.durationMonth),
      scopeNote: (raw.scopeNote ?? '').trim() || null,
    };
    this.api.createForDelivery(Number(raw.deliveryId), payload).subscribe({
      next: () => this.onSaved(false),
      error: (err: Error) => this.onError(err),
    });
  }

  private onSaved(isEdit: boolean): void {
    this.saving.set(false);
    this.snack.open(isEdit ? 'บันทึกประกันแล้ว' : 'สร้างประกันแล้ว', 'ปิด', {
      duration: 2500,
    });
    this.ref.close(true);
  }

  private onError(err: Error): void {
    this.saving.set(false);
    this.error.set(err.message);
  }
}