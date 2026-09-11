import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
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
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  PRIORITY_LABELS,
  PROJECT_PRIORITIES,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  Project,
  ProjectPriority,
  ProjectStatus,
} from '../../core/models/project.model';
import { AuthService } from '../../core/services/auth.service';
import { CustomerService } from '../../core/services/customer.service';
import { ProjectInput, ProjectService } from '../../core/services/project.service';
import { UserService } from '../../core/services/user.service';
import { parseDateOnly, toDateOnlyString } from '../../core/utils/date.util';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { BahtPipe } from '../../shared/pipes/baht.pipe';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { createClientPager } from '../../shared/utils/client-pager';
import { openConfirmDialog } from '../../shared/components/confirm-dialog.component';
import { Router } from '@angular/router';

@Component({
  selector: 'app-projects-page',
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
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDialogModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatMenuModule,
    TablePaginatorComponent,
  ],
  templateUrl: './projects-page.component.html',
  styleUrl: './projects-page.component.scss',
})
export class ProjectsPageComponent implements OnInit {
  private readonly projectsApi = inject(ProjectService);
  private readonly customersApi = inject(CustomerService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly projects = signal<Project[]>([]);
  readonly statusFilter = signal<ProjectStatus | 'ALL'>('ALL');
  readonly search = signal('');
  readonly searchControl = this.fb.nonNullable.control('');
  readonly statusLabels = PROJECT_STATUS_LABELS;
  readonly statuses = PROJECT_STATUSES;
  readonly priorityLabels = PRIORITY_LABELS;
  readonly columns = [
    'name',
    'customer',
    'priority',
    'targetEndDate',
    'progress',
    'status',
    'value',
    'actions',
  ];

  readonly canUpdate = computed(() => {
    this.auth.session();
    return (
      this.auth.hasPermissionCode('project.update') ||
      this.auth.hasPermission('projects', 'update')
    );
  });
  readonly canDelete = computed(() => {
    this.auth.session();
    return (
      this.auth.hasPermissionCode('project.delete') ||
      this.auth.hasPermission('projects', 'delete') ||
      this.canUpdate()
    );
  });

  readonly filtered = computed(() => {
    const status = this.statusFilter();
    const q = this.search().trim().toLowerCase();
    const list = this.projects().filter((p) => {
      const matchStatus = status === 'ALL' || p.status === status;
      if (!matchStatus) {
        return false;
      }
      if (!q) {
        return true;
      }
      const customer = this.customerName(p.customerId).toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        customer.includes(q) ||
        (p.description ?? '').toLowerCase().includes(q)
      );
    });
    const statusRank: Record<ProjectStatus, number> = {
      IN_PROGRESS: 0,
      DRAFT: 1,
      DELIVERED: 2,
      CLOSED: 3,
      CANCELLED: 4,
    };
    return [...list].sort((a, b) => {
      const byStatus = statusRank[a.status] - statusRank[b.status];
      if (byStatus !== 0) {
        return byStatus;
      }
      const aEnd = a.targetEndDate ? new Date(a.targetEndDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bEnd = b.targetEndDate ? new Date(b.targetEndDate).getTime() : Number.MAX_SAFE_INTEGER;
      return aEnd - bEnd;
    });
  });

  readonly pager = createClientPager(this.filtered);

  ngOnInit(): void {
    this.customersApi.listCustomers().subscribe();
    this.reload();
    this.searchControl.valueChanges.subscribe((v) => this.search.set(v));
  }

  reload(): void {
    this.projectsApi.listProjects().subscribe((list) => this.projects.set(list));
  }

  customerName(id: number): string {
    return this.customersApi.getCustomer(id)?.name ?? `#${id}`;
  }

  progress(id: number): number {
    return this.projectsApi.progressPercent(id);
  }

  statusLabel(status: ProjectStatus): string {
    return this.statusLabels[status];
  }

  priorityLabel(priority: ProjectPriority): string {
    return this.priorityLabels[priority];
  }

  openCreate(): void {
    this.openForm();
  }

  openEdit(project: Project): void {
    this.openForm(project);
  }

  openDetail(project: Project): void {
    void this.router.navigate(['/app/projects', project.id]);
  }

  remove(project: Project): void {
    if (!this.canDelete()) {
      this.snack.open('ไม่มีสิทธิ์ลบโครงการ', 'ปิด', { duration: 3000 });
      return;
    }
    openConfirmDialog(this.dialog, {
      title: 'ลบโครงการ',
      message: `ต้องการลบโครงการ「${project.name}」หรือไม่?\nงานย่อยและการส่งมอบที่เกี่ยวข้องอาจถูกลบด้วย`,
      confirmLabel: 'ลบโครงการ',
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.projectsApi.deleteProject(project.id).subscribe({
        next: () => {
          this.snack.open('ลบโครงการแล้ว', 'ปิด', { duration: 2500 });
          this.reload();
        },
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 4000 }),
      });
    });
  }

  private openForm(project?: Project): void {
    const ref = this.dialog.open(ProjectFormDialogComponent, {
      width: '560px',
      maxWidth: '95vw',
      data: { project: project ?? null },
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.reload();
      }
    });
  }
}

import { MoneyInputDirective } from '../../shared/directives/money-input.directive';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { Customer } from '../../core/models/customer.model';
import { CustomerFormDialogComponent } from '../customers/customer-form-dialog.component';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Component({
  selector: 'app-project-form-dialog',
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
    MatAutocompleteModule,
    MoneyInputDirective,
  ],
  templateUrl: './project-form-dialog.component.html',
  styleUrl: './project-form-dialog.component.scss',
})
export class ProjectFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ProjectService);
  private readonly customersApi = inject(CustomerService);
  private readonly usersApi = inject(UserService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly ref = inject(MatDialogRef<ProjectFormDialogComponent, boolean>);
  readonly data = inject<{ project: Project | null; customerId?: number }>(MAT_DIALOG_DATA);

  readonly customers = this.customersApi.customers;
  readonly users = this.usersApi.users;
  readonly statuses = PROJECT_STATUSES;
  readonly statusLabels = PROJECT_STATUS_LABELS;
  readonly priorities = PROJECT_PRIORITIES;
  readonly priorityLabels = PRIORITY_LABELS;
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly showMore = signal(false);
  readonly isEdit = !!this.data.project;
  readonly customerLocked = !this.data.project && !!this.data.customerId;

  readonly customerSearchControl = this.fb.control<string | Customer>('');

  readonly form = this.fb.group({
    name: ['', Validators.required],
    customerId: [0, Validators.min(1)],
    projectType: [''],
    contractValue: [null as number | null, Validators.min(0)],
    functionCount: [null as number | null, Validators.min(0)],
    startDate: [null as Date | null],
    targetEndDate: [null as Date | null],
    status: ['DRAFT' as ProjectStatus, Validators.required],
    priority: ['NORMAL' as ProjectPriority, Validators.required],
    managerUserId: [null as number | null],
    description: [''],
  });

  constructor() {
    this.usersApi.loadForPicker().subscribe({ error: () => undefined });
    this.customersApi.listCustomers().subscribe({
      next: () => this.applyPreferredCustomer(),
      error: () => undefined,
    });

    this.customerSearchControl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged((a, b) => this.customerSearchKey(a) === this.customerSearchKey(b))
      )
      .subscribe((value) => {
        if (this.customerLocked || typeof value !== 'string') {
          return;
        }
        const search = value.trim();
        this.customersApi.listCustomers(search ? { search } : undefined).subscribe({
          error: () => undefined,
        });
        // Typing clears a prior selection until an option is chosen again.
        if (this.form.controls.customerId.value) {
          const selected = this.customersApi.getCustomer(this.form.controls.customerId.value);
          if (!selected || selected.name !== search) {
            this.form.patchValue({ customerId: 0 });
          }
        }
      });

    if (this.data.project) {
      const p = this.data.project;
      this.form.patchValue({
        name: p.name,
        customerId: p.customerId,
        projectType: p.projectType ?? '',
        contractValue: p.contractValue,
        functionCount: p.functionCount,
        startDate: parseDateOnly(p.startDate),
        targetEndDate: parseDateOnly(p.targetEndDate),
        status: p.status,
        priority: p.priority,
        managerUserId: p.managerUserId,
        description: p.description ?? '',
      });
      if (p.functionCount != null) {
        this.showMore.set(true);
      }
      const existing = this.customersApi.getCustomer(p.customerId);
      if (existing) {
        this.customerSearchControl.setValue(existing, { emitEvent: false });
      } else {
        this.customersApi.fetchCustomer(p.customerId).subscribe({
          next: (c) => this.customerSearchControl.setValue(c, { emitEvent: false }),
          error: () => this.customerSearchControl.setValue(`#${p.customerId}`, { emitEvent: false }),
        });
      }
    }
  }

  readonly displayCustomer = (value: string | Customer | null): string => {
    if (!value) {
      return '';
    }
    return typeof value === 'string' ? value : value.name;
  };

  onCustomerSelected(event: MatAutocompleteSelectedEvent): void {
    const customer = event.option.value as Customer;
    this.form.patchValue({ customerId: customer.id });
    this.form.controls.customerId.markAsTouched();
  }

  openCreateCustomer(): void {
    const ref = this.dialog.open(CustomerFormDialogComponent, {
      width: '560px',
      maxWidth: '95vw',
      data: { customer: null, returnCustomer: true },
    });
    ref.afterClosed().subscribe((result) => {
      if (result && typeof result === 'object' && 'id' in result) {
        const customer = result as Customer;
        this.form.patchValue({ customerId: customer.id });
        this.customerSearchControl.setValue(customer, { emitEvent: false });
        this.form.controls.customerId.markAsTouched();
      }
    });
  }

  toggleMore(event: Event): void {
    event.preventDefault();
    this.showMore.update((v) => !v);
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const payload: ProjectInput = {
      name: (raw.name ?? '').trim(),
      customerId: Number(raw.customerId),
      projectType: (raw.projectType ?? '').trim() || undefined,
      contractValue: raw.contractValue == null ? undefined : String(raw.contractValue),
      functionCount: raw.functionCount ?? undefined,
      startDate: toDateOnlyString(raw.startDate) || undefined,
      targetEndDate: toDateOnlyString(raw.targetEndDate) || undefined,
      status: raw.status as ProjectStatus,
      priority: raw.priority as ProjectPriority,
      managerUserId: raw.managerUserId ?? undefined,
      description: (raw.description ?? '').trim() || undefined,
    };
    this.saving.set(true);
    this.error.set(null);
    const req$ = this.data.project
      ? this.api.updateProject(this.data.project.id, payload)
      : this.api.createProject(payload);
    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.snack.open('บันทึกโครงการแล้ว', 'ปิด', { duration: 2500 });
        this.ref.close(true);
      },
      error: (err: Error) => {
        this.saving.set(false);
        this.error.set(err.message);
      },
    });
  }

  private applyPreferredCustomer(): void {
    if (this.data.project || !this.data.customerId) {
      return;
    }
    if ((this.form.value.customerId ?? 0) > 0) {
      return;
    }
    this.form.patchValue({ customerId: this.data.customerId });
    const customer = this.customersApi.getCustomer(this.data.customerId);
    if (customer) {
      this.customerSearchControl.setValue(customer, { emitEvent: false });
    }
  }

  private customerSearchKey(value: string | Customer | null): string {
    if (!value) {
      return '';
    }
    return typeof value === 'string' ? value : `id:${value.id}`;
  }
}