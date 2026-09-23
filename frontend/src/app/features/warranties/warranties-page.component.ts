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
import { Delivery, Project } from '../../core/models/project.model';
import { MaContract } from '../../core/models/ma.model';
import {
  WARRANTY_NEAR_EXPIRY_DAYS,
  WARRANTY_STATUS_LABELS,
  Warranty,
  WarrantyStatus,
  warrantyMaLinkLabel,
} from '../../core/models/warranty.model';
import { AuthService } from '../../core/services/auth.service';
import { CustomerService } from '../../core/services/customer.service';
import { MaService } from '../../core/services/ma.service';
import { ProjectService } from '../../core/services/project.service';
import {
  WarrantyCreateInput,
  WarrantyService,
  WarrantyUpdateInput,
} from '../../core/services/warranty.service';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { CodeLabelComponent } from '../../shared/components/code-label.component';
import { createClientPager } from '../../shared/utils/client-pager';
import { FORM_DIALOG } from '../../shared/utils/form-dialog';
import { openConfirmDialog } from '../../shared/components/confirm-dialog.component';
import { swallowHttpError } from '../../shared/utils/swallow-http-error';
import { createTableSort } from '../../shared/utils/table-sort';
import { MaFormDialogComponent } from '../ma/ma-page.component';

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
    CodeLabelComponent,
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
  readonly columns = ['warrantyNo', 'project', 'title', 'period', 'daysLeft', 'maLink', 'status', 'actions'];
  readonly maLinkLabel = warrantyMaLinkLabel;

  readonly tableSort = createTableSort<
    'warrantyNo' | 'project' | 'title' | 'period' | 'daysLeft' | 'maLink' | 'status'
  >('daysLeft');

  readonly filtered = computed(() => {
    const list = this.warranties();
    const view = this.view();
    let rows = list;
    if (view === 'near') {
      rows = list.filter((w) => this.isNear(w));
    } else if (view === 'active') {
      rows = list.filter((w) => w.isCurrentlyActive);
    }
    const q = this.search().trim().toLowerCase();
    if (q) {
      rows = rows.filter((w) => {
        const projectName = (w.project?.name ?? '').toLowerCase();
        const customerName = (w.project?.customerName ?? this.customerName(w)).toLowerCase();
        const deliveryTitle = (w.delivery?.title ?? '').toLowerCase();
        return (
          projectName.includes(q) ||
          customerName.includes(q) ||
          deliveryTitle.includes(q) ||
          (w.warrantyNo ?? '').toLowerCase().includes(q) ||
          this.statusLabel(w.status).toLowerCase().includes(q) ||
          (w.scopeNote ?? '').toLowerCase().includes(q)
        );
      });
    }
    return this.tableSort.apply(rows, (row, key) => {
      switch (key) {
        case 'warrantyNo':
          return row.warrantyNo ?? '';
        case 'project':
          return this.projectName(row);
        case 'title':
          return `${row.delivery?.title || 'ประกัน'} · ${row.durationMonth}`;
        case 'period':
          return row.endDate ?? row.startDate ?? '';
        case 'daysLeft':
          return this.api.daysUntilExpiry(row);
        case 'maLink':
          return this.maLinkLabel(row);
        case 'status':
          return this.statusLabel(row.status);
      }
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
    return w.projectId ? `โปรเจกต์ #${w.projectId}` : '—';
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
      (w.isCurrentlyActive)
    );
  }

  statusLabel(status: Warranty['status']): string {
    return this.statusLabels[status];
  }

  toggleSort(
    key: 'warrantyNo' | 'project' | 'title' | 'period' | 'daysLeft' | 'maLink' | 'status'
  ): void {
    this.tableSort.toggleSort(key);
    this.pager.reset();
  }

  sortIcon(
    key: 'warrantyNo' | 'project' | 'title' | 'period' | 'daysLeft' | 'maLink' | 'status'
  ): string {
    return this.tableSort.sortIcon(key);
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
      message: `ต้องการลบประกันของ「${row.project?.name || 'โปรเจกต์'}」หรือไม่?`,
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
    MatIconModule,
  ],
  templateUrl: './warranty-form-dialog.component.html',
  styleUrl: './warranty-form-dialog.component.scss',
})
export class WarrantyFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(WarrantyService);
  private readonly customersApi = inject(CustomerService);
  private readonly projectsApi = inject(ProjectService);
  private readonly maApi = inject(MaService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject(MatDialogRef<WarrantyFormDialogComponent, boolean>);
  readonly data = inject<WarrantyFormDialogData>(MAT_DIALOG_DATA);

  readonly customers = this.customersApi.customers;
  /** โปรเจกต์ของลูกค้าที่เลือก — GET ?customerId= · รวม CLOSED */
  readonly customerProjects = signal<Project[]>([]);
  readonly deliveries = signal<Delivery[]>([]);
  readonly maContracts = signal<MaContract[]>([]);
  readonly statusLabels = WARRANTY_STATUS_LABELS;
  readonly statuses = Object.keys(WARRANTY_STATUS_LABELS) as WarrantyStatus[];
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly canCreateMa = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('ma.create');
  });
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
    maContractId: [
      this.data && 'maContractId' in this.data
        ? (this.data.maContractId ?? null)
        : (null as number | null),
    ],
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

    this.form.controls.customerId.valueChanges.subscribe((customerId) => {
      if (this.lockDelivery) {
        return;
      }
      this.form.patchValue({ projectId: null, deliveryId: null, maContractId: null });
      this.deliveries.set([]);
      this.maContracts.set([]);
      this.loadCustomerProjects(Number(customerId) || 0);
    });
    this.form.controls.projectId.valueChanges.subscribe((projectId) => {
      if (this.lockDelivery) {
        return;
      }
      this.form.patchValue({ deliveryId: null, maContractId: null });
      this.deliveries.set([]);
      this.maContracts.set([]);
      if (projectId) {
        this.loadDeliveries(projectId);
        this.loadMaContracts(projectId, { preferSelect: !this.isEdit });
      }
    });

    const { customerId, projectId } = this.form.getRawValue();
    this.loadCustomerProjects(Number(customerId) || 0);
    if (projectId) {
      this.loadDeliveries(projectId);
      this.loadMaContracts(projectId, { preferSelect: !this.isEdit });
    }
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

  maContractOptionLabel(c: MaContract): string {
    const no = c.contractNo?.trim() || `#${c.id}`;
    const plan = c.plan?.name?.trim() || '—';
    const status = c.isCurrentlyActive
      ? 'ใช้งานอยู่'
      : c.status === 'DRAFT'
        ? 'ร่าง'
        : c.status === 'EXPIRED'
          ? 'หมดอายุ'
          : c.status;
    return `${no} · ${plan} (${status})`;
  }

  /** สร้างสัญญา MA ของโปรเจกต์นี้แล้วกลับมาเลือกลงในประกัน */
  openCreateMaForProject(): void {
    if (!this.canCreateMa()) {
      this.error.set('ไม่มีสิทธิ์สร้างสัญญา MA — ติดต่อผู้ดูแลระบบ');
      return;
    }
    const projectId = Number(this.form.getRawValue().projectId) || 0;
    const customerId = Number(this.form.getRawValue().customerId) || 0;
    if (!projectId) {
      this.error.set('เลือกโปรเจกต์ก่อนจึงสร้างสัญญา MA ได้');
      return;
    }
    const ref = this.dialog.open(MaFormDialogComponent, {
      ...FORM_DIALOG,
      data: {
        projectId,
        customerId: customerId || undefined,
      },
    });
    ref.afterClosed().subscribe((saved) => {
      if (!saved) {
        return;
      }
      this.loadMaContracts(projectId, { preferSelect: true });
      this.snack.open('สร้างสัญญา MA แล้ว — เลือกในช่องด้านบนได้', 'ปิด', {
        duration: 3500,
      });
    });
  }

  private loadDeliveries(projectId: number): void {
    this.projectsApi.listDeliveries(projectId).subscribe({
      next: (rows) => this.deliveries.set(rows),
      error: (err: Error) => this.error.set(err.message),
    });
  }

  private loadMaContracts(
    projectId: number,
    opts?: { preferSelect?: boolean }
  ): void {
    this.maApi
      .list({ projectId, limit: 100 })
      .pipe(swallowHttpError([] as MaContract[], 'warranty-form ma-contracts'))
      .subscribe((rows) => {
        // เรียงด้วย isCurrentlyActive เท่านั้น — ห้ามใช้ status (ACTIVE ในฐานอาจหมดอายุแล้ว)
        const sorted = [...rows].sort((a, b) => {
          const aRank = a.isCurrentlyActive ? 0 : 1;
          const bRank = b.isCurrentlyActive ? 0 : 1;
          if (aRank !== bRank) {
            return aRank - bRank;
          }
          return a.id - b.id;
        });
        this.maContracts.set(sorted);

        if (this.isEdit || !opts?.preferSelect) {
          return;
        }
        const current = this.form.controls.maContractId.value;
        if (current != null && Number(current) > 0) {
          return;
        }
        const active = sorted.filter((c) => c.isCurrentlyActive);
        const pick = active.length === 1 ? active[0] : sorted.length === 1 ? sorted[0] : null;
        if (pick) {
          this.form.patchValue({ maContractId: pick.id }, { emitEvent: false });
        }
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
    const maContractId =
      raw.maContractId != null && Number(raw.maContractId) > 0
        ? Number(raw.maContractId)
        : null;

    if (this.isEdit && this.data && 'id' in this.data) {
      const payload: WarrantyUpdateInput = {
        durationMonth: Number(raw.durationMonth),
        status: (raw.status as WarrantyStatus) ?? 'ACTIVE',
        scopeNote: (raw.scopeNote ?? '').trim() || null,
        maContractId,
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
      ...(maContractId != null ? { maContractId } : {}),
    };
    this.api.createForDelivery(Number(raw.deliveryId), payload).subscribe({
      next: (created) => this.onSaved(false, created),
      error: (err: Error) => this.onError(err),
    });
  }

  private onSaved(isEdit: boolean, created?: Warranty): void {
    this.saving.set(false);
    if (!isEdit && created) {
      const code = created.warrantyNo?.trim();
      this.snack.open(
        code ? `สร้างประกันแล้ว · ${code}` : 'สร้างประกันแล้ว',
        'ปิด',
        { duration: code ? 5000 : 2500 }
      );
      this.ref.close(created);
      return;
    }
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