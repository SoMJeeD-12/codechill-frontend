import { CurrencyPipe, DatePipe } from '@angular/common';
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
  PROJECT_STATUS_LABELS,
  Project,
  ProjectStatus,
} from '../../core/models/project.model';
import { CustomerService } from '../../core/services/customer.service';
import { ProjectInput, ProjectService } from '../../core/services/project.service';
import { parseDateOnly, toDateOnlyString } from '../../core/utils/date.util';

@Component({
  selector: 'app-projects-page',
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
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
  readonly statuses = Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[];
  readonly columns = ['code', 'name', 'customer', 'dueDate', 'progress', 'status', 'value', 'actions'];

  readonly filtered = computed(() => {
    const status = this.statusFilter();
    const q = this.search().trim().toLowerCase();
    return this.projects().filter((p) => {
      const matchStatus = status === 'ALL' || p.status === status;
      if (!matchStatus) {
        return false;
      }
      if (!q) {
        return true;
      }
      const customer = this.customerName(p.customerId).toLowerCase();
      return (
        p.code.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        customer.includes(q) ||
        p.description.toLowerCase().includes(q)
      );
    });
  });

  ngOnInit(): void {
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
  ],
  templateUrl: './project-form-dialog.component.html',
  styleUrl: './project-form-dialog.component.scss',
})
export class ProjectFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ProjectService);
  private readonly customersApi = inject(CustomerService);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject(MatDialogRef<ProjectFormDialogComponent, boolean>);
  readonly data = inject<{ project: Project | null }>(MAT_DIALOG_DATA);

  readonly customers = this.customersApi.customers;
  readonly statuses = Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[];
  readonly statusLabels = PROJECT_STATUS_LABELS;
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly isEdit = !!this.data.project;

  readonly form = this.fb.group({
    name: ['', Validators.required],
    customerId: [0, Validators.min(1)],
    contractValue: [0, Validators.min(0)],
    dueDate: [null as Date | null, Validators.required],
    status: ['PLANNING' as ProjectStatus, Validators.required],
    description: [''],
  });

  constructor() {
    if (this.data.project) {
      const p = this.data.project;
      this.form.patchValue({
        name: p.name,
        customerId: p.customerId,
        contractValue: p.contractValue,
        dueDate: parseDateOnly(p.dueDate),
        status: p.status,
        description: p.description,
      });
    } else {
      const first = this.customers()[0];
      if (first) {
        this.form.patchValue({ customerId: first.id });
      }
    }
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const payload: ProjectInput = {
      name: raw.name ?? '',
      customerId: Number(raw.customerId),
      contractValue: Number(raw.contractValue) || 0,
      dueDate: toDateOnlyString(raw.dueDate),
      status: raw.status as ProjectStatus,
      description: raw.description ?? '',
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
