import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
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
import { MatMenuModule } from '@angular/material/menu';
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
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { createClientPager } from '../../shared/utils/client-pager';
import { FORM_DIALOG } from '../../shared/utils/form-dialog';
import { openConfirmDialog } from '../../shared/components/confirm-dialog.component';

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
    MatMenuModule,
    TablePaginatorComponent,
  ],
  templateUrl: './warranties-page.component.html',
  styleUrl: './warranties-page.component.scss',
})
export class WarrantiesPageComponent implements OnInit {
  private readonly api = inject(WarrantyService);
  private readonly customersApi = inject(CustomerService);
  private readonly projectsApi = inject(ProjectService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);

  readonly warranties = signal<Warranty[]>([]);
  readonly view = signal<'near' | 'active' | 'all'>('all');
  readonly search = signal('');
  readonly searchControl = this.fb.nonNullable.control('');
  readonly statusLabels = WARRANTY_STATUS_LABELS;
  readonly nearDays = WARRANTY_NEAR_EXPIRY_DAYS;
  readonly columns = ['project', 'title', 'period', 'daysLeft', 'status', 'actions'];

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

  readonly pager = createClientPager(this.filtered);

  ngOnInit(): void {
    this.searchControl.valueChanges.subscribe((v) => this.search.set(v));
    this.customersApi.listCustomers().subscribe();
    this.projectsApi.listProjects().subscribe();
    // เข้ามาจากการ์ด "ประกัน / MA ใกล้หมด" บนหน้าแรก
    if (this.route.snapshot.queryParamMap.get('expiring')) {
      this.view.set('near');
    }
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

  projectName(w: Warranty): string {
    if (w.project?.name?.trim()) {
      return w.project.name.trim();
    }
    const project = w.projectId ? this.projectsApi.getProject(w.projectId) : null;
    if (project?.name) {
      return project.name;
    }
    return w.projectId ? `โปรเจค #${w.projectId}` : '—';
  }

  customerName(w: Warranty): string {
    if (w.project?.customerName) {
      return w.project.customerName;
    }
    const id = w.project?.customerId;
    return id ? this.customersApi.getCustomer(id)?.name ?? `#${id}` : '—';
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
      ...FORM_DIALOG,
      data: row ?? null,
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.view.set('all');
        this.reload();
      }
    });
  }

  remove(row: Warranty): void {
    openConfirmDialog(this.dialog, {
      title: 'ลบประกัน',
      message: `ต้องการลบประกันของ「${row.project?.name || 'โปรเจค'}」หรือไม่?`,
      confirmLabel: 'ลบประกัน',
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.api.remove(row.id).subscribe({
        next: () => {
          this.snack.open('ลบประกันแล้ว', 'ปิด', { duration: 2500 });
          this.reload();
        },
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 4000 }),
      });
    });
  }
}

export type WarrantyFormDialogData =
  | Warranty
  | {
      customerId: number;
      projectId?: number;
      deliveryId?: number;
      /** ล็อกลูกค้า/โครงการ/การส่งมอบ — กรอกแค่ระยะเดือน */
      lockDelivery?: boolean;
      deliveryLabel?: string;
    }
  | null;

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
  readonly data = inject<WarrantyFormDialogData>(MAT_DIALOG_DATA);

  readonly customers = this.customersApi.customers;
  readonly projects = this.projectsApi.projects;
  readonly deliveries = signal<Delivery[]>([]);
  readonly statusLabels = WARRANTY_STATUS_LABELS;
  readonly statuses = Object.keys(WARRANTY_STATUS_LABELS) as WarrantyStatus[];
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly isEdit = !!(this.data && 'id' in this.data && this.data.id);
  readonly lockDelivery = !!(
    this.data &&
    !('id' in this.data) &&
    'lockDelivery' in this.data &&
    this.data.lockDelivery
  );
  readonly deliveryLabel =
    this.data && !('id' in this.data) && 'deliveryLabel' in this.data
      ? (this.data.deliveryLabel ?? '')
      : '';

  readonly form = this.fb.group({
    customerId: [
      this.data && 'project' in this.data
        ? (this.data.project?.customerId ?? 0)
        : this.data && 'customerId' in this.data
          ? this.data.customerId
          : 0,
      Validators.min(1),
    ],
    projectId: [
      this.data && 'projectId' in this.data ? this.data.projectId : (null as number | null),
      Validators.required,
    ],
    deliveryId: [
      this.data && 'deliveryId' in this.data ? this.data.deliveryId : (null as number | null),
      Validators.required,
    ],
    durationMonth: [
      this.data && 'durationMonth' in this.data ? this.data.durationMonth : 12,
      [Validators.required, Validators.min(1), Validators.max(120)],
    ],
    status: [
      (this.data && 'status' in this.data ? this.data.status : 'ACTIVE') as WarrantyStatus,
    ],
    scopeNote: [this.data && 'scopeNote' in this.data ? (this.data.scopeNote ?? '') : ''],
  });

  constructor() {
    if (!this.isEdit) {
      const preset =
        this.data && 'customerId' in this.data && !('id' in this.data)
          ? this.data.customerId
          : this.customers()[0]?.id;
      if (preset) {
        this.form.patchValue({ customerId: preset });
      }
      if (this.data && 'customerId' in this.data && !('id' in this.data)) {
        this.form.controls.customerId.disable({ emitEvent: false });
      }
      if (this.lockDelivery) {
        this.form.controls.customerId.disable({ emitEvent: false });
        this.form.controls.projectId.disable({ emitEvent: false });
        this.form.controls.deliveryId.disable({ emitEvent: false });
      }
    } else {
      this.form.controls.customerId.disable();
      this.form.controls.projectId.disable();
      this.form.controls.deliveryId.disable();
    }

    this.form.controls.customerId.valueChanges.subscribe(() => {
      if (this.lockDelivery) {
        return;
      }
      this.form.patchValue({ projectId: null, deliveryId: null });
      this.deliveries.set([]);
    });
    this.form.controls.projectId.valueChanges.subscribe((projectId) => {
      if (this.lockDelivery) {
        return;
      }
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

    if (this.isEdit && this.data && 'id' in this.data) {
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