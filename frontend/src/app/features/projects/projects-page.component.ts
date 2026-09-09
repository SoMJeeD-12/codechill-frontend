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
import { CustomerService } from '../../core/services/customer.service';
import { ProjectInput, ProjectService } from '../../core/services/project.service';
import { UserService } from '../../core/services/user.service';
import { parseDateOnly, toDateOnlyString } from '../../core/utils/date.util';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { BahtPipe } from '../../shared/pipes/baht.pipe';

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
  ],
  templateUrl: './projects-page.component.html',
  styleUrl: './projects-page.component.scss',
})
export class ProjectsPageComponent implements OnInit {
  private readonly projectsApi = inject(ProjectService);
  private readonly customersApi = inject(CustomerService);
  private readonly dialog = inject(MatDialog);
  private readonly fb = inject(FormBuilder);

  readonly projects = signal<Project[]>([]);
  readonly statusFilter = signal<ProjectStatus | 'ALL'>('ALL');
  readonly search = signal('');
  readonly searchControl = this.fb.nonNullable.control('');
  readonly statusLabels = PROJECT_STATUS_LABELS;
  readonly statuses = PROJECT_STATUSES;
  readonly priorityLabels = PRIORITY_LABELS;
  readonly columns = [
    'code',
    'name',
    'customer',
    'priority',
    'targetEndDate',
    'progress',
    'status',
    'value',
    'actions',
  ];

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
        (p.code ?? '').toLowerCase().includes(q) ||
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
  private readonly ref = inject(MatDialogRef<ProjectFormDialogComponent, boolean>);
  readonly data = inject<{ project: Project | null }>(MAT_DIALOG_DATA);

  readonly customers = this.customersApi.customers;
  readonly users = this.usersApi.users;
  readonly statuses = PROJECT_STATUSES;
  readonly statusLabels = PROJECT_STATUS_LABELS;
  readonly priorities = PROJECT_PRIORITIES;
  readonly priorityLabels = PRIORITY_LABELS;
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly isEdit = !!this.data.project;

  readonly form = this.fb.group({
    name: ['', Validators.required],
    code: [''],
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
    this.usersApi.list().subscribe({ error: () => undefined });
    this.customersApi.listCustomers().subscribe({
      next: () => {
        if (!this.data.project) {
          const first = this.customers()[0];
          if (first && !this.form.value.customerId) {
            this.form.patchValue({ customerId: first.id });
          }
        }
      },
    });
    if (this.data.project) {
      const p = this.data.project;
      this.form.patchValue({
        name: p.name,
        code: p.code ?? '',
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
    }
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const payload: ProjectInput = {
      name: (raw.name ?? '').trim(),
      code: (raw.code ?? '').trim() || undefined,
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
}