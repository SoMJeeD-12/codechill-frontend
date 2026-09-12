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
import {
  ContactInput,
  CustomerInput,
  CustomerService,
} from '../../core/services/customer.service';
import {
  ProjectInput,
  ProjectNewCustomerInput,
  ProjectService,
} from '../../core/services/project.service';
import { UserService } from '../../core/services/user.service';
import { parseDateOnly, toDateOnlyString } from '../../core/utils/date.util';
import { sanitizePhoneDigits, thaiPhoneValidator } from '../../core/utils/phone.util';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { createClientPager } from '../../shared/utils/client-pager';
import { openConfirmDialog } from '../../shared/components/confirm-dialog.component';
import { Router } from '@angular/router';
import { Customer } from '../../core/models/customer.model';
import { MoneyInputDirective } from '../../shared/directives/money-input.directive';
import { PhoneInputDirective } from '../../shared/directives/phone-input.directive';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { Observable, of, switchMap } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map } from 'rxjs/operators';

@Component({
  selector: 'app-projects-page',
  standalone: true,
  imports: [
    ThaiDatePipe,
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
    'code',
    'name',
    'customer',
    'status',
    'progress',
    'manager',
    'targetEndDate',
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
      this.snack.open('ไม่มีสิทธิ์ลบโปรเจค', 'ปิด', { duration: 3000 });
      return;
    }
    openConfirmDialog(this.dialog, {
      title: 'ลบโปรเจค',
      message: `ต้องการลบโปรเจค「${project.name}」หรือไม่?\nงานย่อยและการส่งมอบที่เกี่ยวข้องอาจถูกลบด้วย`,
      confirmLabel: 'ลบโปรเจค',
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.projectsApi.deleteProject(project.id).subscribe({
        next: () => {
          this.snack.open('ลบโปรเจคแล้ว', 'ปิด', { duration: 2500 });
          this.reload();
        },
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 4000 }),
      });
    });
  }

  private openForm(project?: Project): void {
    const ref = this.dialog.open(ProjectFormDialogComponent, {
      width: '1040px',
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

const NEW_CUSTOMER_TOKEN = '__NEW_CUSTOMER__';

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
    MatIconModule,
    MatSnackBarModule,
    MatDatepickerModule,
    MatAutocompleteModule,
    MoneyInputDirective,
    PhoneInputDirective,
  ],
  templateUrl: './project-form-dialog.component.html',
  styleUrl: './project-form-dialog.component.scss',
})
export class ProjectFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ProjectService);
  private readonly customersApi = inject(CustomerService);
  private readonly usersApi = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject(MatDialogRef<ProjectFormDialogComponent, boolean>);
  readonly data = inject<{ project: Project | null; customerId?: number }>(MAT_DIALOG_DATA);

  readonly users = this.usersApi.users;
  readonly statuses = PROJECT_STATUSES;
  readonly statusLabels = PROJECT_STATUS_LABELS;
  readonly priorities = PROJECT_PRIORITIES;
  readonly priorityLabels = PRIORITY_LABELS;
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly isEdit = !!this.data.project;
  /** สร้างจากหน้าลูกค้า — ล็อกเลือกลูกค้า */
  readonly customerLocked = !this.data.project && !!this.data.customerId;

  /** none | existing | new */
  readonly customerMode = signal<'none' | 'existing' | 'new'>('none');
  readonly customerSuggestions = signal<Customer[]>([]);
  /** true เมื่อพิมพ์ค้นหา ≥2 ตัว — ถึงจะโชว์ตัวเลือก autocomplete */
  readonly customerQueryReady = signal(false);
  readonly newCustomerToken = NEW_CUSTOMER_TOKEN;

  readonly canViewCustomer = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('customer.view');
  });
  readonly canCreateCustomer = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('customer.create');
  });

  readonly customerSearchControl = this.fb.control<string | Customer | typeof NEW_CUSTOMER_TOKEN>(
    ''
  );

  readonly form = this.fb.group({
    name: ['', Validators.required],
    code: [''],
    customerId: [0],
    projectType: [''],
    contractValue: [null as number | null, Validators.min(0)],
    startDate: [null as Date | null],
    targetEndDate: [null as Date | null],
    status: ['DRAFT' as ProjectStatus, Validators.required],
    priority: ['NORMAL' as ProjectPriority, Validators.required],
    managerUserId: [null as number | null],
    description: [''],
    // ฟอร์มสร้างโปรเจคเก็บเฉพาะข้อมูลลูกค้าที่จำเป็น
    // (LINE / Facebook / หมายเหตุ แก้ได้ที่หน้าลูกค้า)
    customer: this.fb.group({
      name: [''],
      taxId: [''],
      address: [''],
      phone: ['', thaiPhoneValidator],
      email: ['', Validators.email],
    }),
    contact: this.fb.group({
      name: [''],
      phone: ['', thaiPhoneValidator],
      email: ['', Validators.email],
      position: [''],
    }),
  });

  /** snapshot ของลูกค้าที่เลือก — ใช้เช็คว่าแก้ฟิลด์ลูกค้าหรือไม่ */
  private selectedCustomerSnapshot: Customer | null = null;

  constructor() {
    this.usersApi.loadForPicker().subscribe({ error: () => undefined });

    if (!this.isEdit && this.canViewCustomer()) {
      this.customerSearchControl.valueChanges
        .pipe(
          debounceTime(300),
          distinctUntilChanged((a, b) => this.customerSearchKey(a) === this.customerSearchKey(b))
        )
        .subscribe((value) => this.onCustomerSearchChanged(value));
    }

    if (this.data.project) {
      this.patchEditProject(this.data.project);
    } else if (this.data.customerId) {
      this.applyPreferredCustomer(this.data.customerId);
    }
  }

  readonly displayCustomer = (
    value: string | Customer | typeof NEW_CUSTOMER_TOKEN | null
  ): string => {
    if (!value) {
      return '';
    }
    if (value === NEW_CUSTOMER_TOKEN) {
      return 'ลูกค้าใหม่';
    }
    return typeof value === 'string' ? value : value.name;
  };

  onCustomerSelected(event: MatAutocompleteSelectedEvent): void {
    const value = event.option.value as Customer | typeof NEW_CUSTOMER_TOKEN;
    if (value === NEW_CUSTOMER_TOKEN) {
      this.selectNewCustomer();
      return;
    }
    this.selectExistingCustomer(value);
  }

  save(): void {
    this.syncCustomerValidators();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.isEdit && this.data.project) {
      this.saveEdit(this.data.project.id);
      return;
    }
    this.saveCreate();
  }

  private saveEdit(projectId: number): void {
    const payload = this.buildProjectPayload();
    payload.customerId = Number(this.form.controls.customerId.value) || this.data.project?.customerId;
    this.saving.set(true);
    this.error.set(null);
    this.api.updateProject(projectId, payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.snack.open('บันทึกโปรเจคแล้ว', 'ปิด', { duration: 2500 });
        this.ref.close(true);
      },
      error: (err: Error) => {
        this.saving.set(false);
        this.error.set(err.message);
      },
    });
  }

  private saveCreate(): void {
    const mode = this.customerMode();
    if (mode === 'none') {
      this.error.set('เลือกลูกค้าหรือสร้างลูกค้าใหม่');
      this.customerSearchControl.markAsTouched();
      return;
    }

    const contactRaw = this.form.controls.contact.getRawValue();
    const contactPartial =
      !!(contactRaw.name ?? '').trim() ||
      !!sanitizePhoneDigits(contactRaw.phone) ||
      !!(contactRaw.email ?? '').trim() ||
      !!(contactRaw.position ?? '').trim();
    if (contactPartial && !(contactRaw.name ?? '').trim()) {
      this.error.set('กรุณาระบุชื่อผู้ติดต่อเมื่อกรอกข้อมูลผู้ติดต่อ');
      this.form.controls.contact.controls.name.markAsTouched();
      return;
    }

    const payload = this.buildProjectPayload();
    if (mode === 'existing') {
      payload.customerId = Number(this.form.controls.customerId.value);
      delete payload.newCustomer;
    } else {
      payload.newCustomer = this.buildNewCustomerPayload();
      delete payload.customerId;
    }

    this.saving.set(true);
    this.error.set(null);

    this.api
      .createProject(payload)
      .pipe(
        switchMap(({ project, message }) =>
          this.afterCreateSideEffects(project).pipe(map(() => ({ project, message })))
        )
      )
      .subscribe({
        next: ({ message }) => {
          this.saving.set(false);
          const text = message?.trim() || 'บันทึกโปรเจคแล้ว';
          this.snack.open(text, 'ปิด', { duration: message ? 6000 : 2500 });
          this.ref.close(true);
        },
        error: (err: Error) => {
          this.saving.set(false);
          this.error.set(err.message);
        },
      });
  }

  /** หลังสร้างโปรเจค: อัปเดตลูกค้าถ้าแก้ฟิลด์ / สร้างผู้ติดต่อถ้ากรอก */
  private afterCreateSideEffects(project: Project): Observable<unknown> {
    const customerId = project.customerId;
    let chain$: Observable<unknown> = of(null);

    if (this.customerMode() === 'existing' && this.isCustomerDirty()) {
      chain$ = chain$.pipe(
        switchMap(() => this.customersApi.updateCustomer(customerId, this.buildCustomerUpdateInput()))
      );
    }

    const contact = this.buildContactInput();
    if (contact) {
      chain$ = chain$.pipe(
        switchMap(() => this.customersApi.saveContact(customerId, contact))
      );
    }

    return chain$.pipe(
      catchError((err: Error) => {
        this.snack.open(err.message || 'บันทึกข้อมูลลูกค้า/ผู้ติดต่อไม่สำเร็จ', 'ปิด', {
          duration: 4000,
        });
        return of(null);
      })
    );
  }

  private buildProjectPayload(): ProjectInput {
    const raw = this.form.getRawValue();
    return {
      name: (raw.name ?? '').trim(),
      code: (raw.code ?? '').trim() || undefined,
      projectType: (raw.projectType ?? '').trim() || undefined,
      contractValue: raw.contractValue == null ? undefined : String(raw.contractValue),
      startDate: toDateOnlyString(raw.startDate) || undefined,
      targetEndDate: toDateOnlyString(raw.targetEndDate) || undefined,
      status: raw.status as ProjectStatus,
      priority: raw.priority as ProjectPriority,
      managerUserId: raw.managerUserId ?? undefined,
      description: (raw.description ?? '').trim() || undefined,
    };
  }

  private buildNewCustomerPayload(): ProjectNewCustomerInput {
    const c = this.form.controls.customer.getRawValue();
    return {
      name: (c.name ?? '').trim(),
      taxId: (c.taxId ?? '').trim() || undefined,
      address: (c.address ?? '').trim() || undefined,
      phone: sanitizePhoneDigits(c.phone) || undefined,
      email: (c.email ?? '').trim() || undefined,
    };
  }

  private buildCustomerUpdateInput(): CustomerInput {
    const c = this.form.controls.customer.getRawValue();
    return {
      name: (c.name ?? '').trim(),
      taxId: (c.taxId ?? '').trim() || undefined,
      address: (c.address ?? '').trim() || undefined,
      phone: sanitizePhoneDigits(c.phone) || undefined,
      email: (c.email ?? '').trim() || undefined,
    };
  }

  private buildContactInput(): ContactInput | null {
    const c = this.form.controls.contact.getRawValue();
    const name = (c.name ?? '').trim();
    const phone = sanitizePhoneDigits(c.phone);
    const email = (c.email ?? '').trim();
    const position = (c.position ?? '').trim();
    if (!name && !phone && !email && !position) {
      return null;
    }
    if (!name) {
      return null;
    }
    return {
      name,
      phone: phone || undefined,
      email: email || undefined,
      position: position || undefined,
      isPrimary: true,
    };
  }

  private isCustomerDirty(): boolean {
    const snap = this.selectedCustomerSnapshot;
    if (!snap) {
      return false;
    }
    const c = this.form.controls.customer.getRawValue();
    const norm = (v: string | null | undefined) => (v ?? '').trim();
    return (
      norm(c.name) !== norm(snap.name) ||
      norm(c.taxId) !== norm(snap.taxId) ||
      norm(c.address) !== norm(snap.address) ||
      sanitizePhoneDigits(c.phone) !== sanitizePhoneDigits(snap.phone) ||
      norm(c.email) !== norm(snap.email)
    );
  }

  private syncCustomerValidators(): void {
    const nameCtrl = this.form.controls.customer.controls.name;
    if (!this.isEdit && this.customerMode() === 'new') {
      nameCtrl.setValidators([Validators.required]);
    } else if (!this.isEdit && this.customerMode() === 'existing') {
      nameCtrl.setValidators([Validators.required]);
    } else {
      nameCtrl.clearValidators();
    }
    nameCtrl.updateValueAndValidity({ emitEvent: false });
  }

  private onCustomerSearchChanged(
    value: string | Customer | typeof NEW_CUSTOMER_TOKEN | null
  ): void {
    if (this.customerLocked || this.isEdit || typeof value !== 'string') {
      return;
    }
    const search = value.trim();
    if (this.customerMode() === 'existing' && this.form.controls.customerId.value) {
      const selected = this.selectedCustomerSnapshot;
      if (!selected || selected.name !== search) {
        this.clearCustomerSelection(false);
      }
    }
    if (this.customerMode() === 'new' && search !== 'ลูกค้าใหม่') {
      // ยังอยู่โหมดใหม่ แต่พิมพ์ค้นหา — เคลียร์โหมดใหม่ถ้าเริ่มค้น
      if (search.length >= 2) {
        this.customerMode.set('none');
        this.clearCustomerFields();
      }
    }

    if (search.length < 2 || !this.canViewCustomer()) {
      this.customerQueryReady.set(false);
      this.customerSuggestions.set([]);
      return;
    }

    this.customerQueryReady.set(true);
    this.customersApi.listCustomers({ search, limit: 10 }).subscribe({
      next: (list) => this.customerSuggestions.set(list),
      error: () => this.customerSuggestions.set([]),
    });
  }

  private selectExistingCustomer(customer: Customer): void {
    this.customerMode.set('existing');
    this.selectedCustomerSnapshot = customer;
    this.form.patchValue({ customerId: customer.id });
    this.patchCustomerFields(customer);
    this.customerSearchControl.setValue(customer, { emitEvent: false });
    this.customerSuggestions.set([]);
    this.customerQueryReady.set(false);
    this.error.set(null);
  }

  private selectNewCustomer(): void {
    this.customerMode.set('new');
    this.selectedCustomerSnapshot = null;
    this.form.patchValue({ customerId: 0 });
    this.clearCustomerFields();
    this.customerSearchControl.setValue(NEW_CUSTOMER_TOKEN, { emitEvent: false });
    this.customerSuggestions.set([]);
    this.customerQueryReady.set(false);
    this.error.set(null);
  }

  private clearCustomerSelection(clearSearch: boolean): void {
    this.customerMode.set('none');
    this.selectedCustomerSnapshot = null;
    this.form.patchValue({ customerId: 0 });
    this.clearCustomerFields();
    if (clearSearch) {
      this.customerSearchControl.setValue('', { emitEvent: false });
    }
  }

  private clearCustomerFields(): void {
    this.form.controls.customer.reset({
      name: '',
      taxId: '',
      address: '',
      phone: '',
      email: '',
    });
  }

  private patchCustomerFields(c: Customer): void {
    this.form.controls.customer.patchValue({
      name: c.name ?? '',
      taxId: c.taxId ?? '',
      address: c.address ?? '',
      phone: sanitizePhoneDigits(c.phone),
      email: c.email ?? '',
    });
  }

  private patchEditProject(p: Project): void {
    this.form.patchValue({
      name: p.name,
      code: p.code ?? '',
      customerId: p.customerId,
      projectType: p.projectType ?? '',
      contractValue: p.contractValue,
      startDate: parseDateOnly(p.startDate),
      targetEndDate: parseDateOnly(p.targetEndDate),
      status: p.status,
      priority: p.priority,
      managerUserId: p.managerUserId,
      description: p.description ?? '',
    });
    this.customerMode.set('existing');
    this.customerSearchControl.disable({ emitEvent: false });
    const existing = this.customersApi.getCustomer(p.customerId);
    if (existing) {
      this.customerSearchControl.setValue(existing, { emitEvent: false });
      this.selectedCustomerSnapshot = existing;
      this.patchCustomerFields(existing);
    } else {
      this.customersApi.fetchCustomer(p.customerId).subscribe({
        next: (c) => {
          this.customerSearchControl.setValue(c, { emitEvent: false });
          this.selectedCustomerSnapshot = c;
          this.patchCustomerFields(c);
        },
        error: () =>
          this.customerSearchControl.setValue(`#${p.customerId}`, { emitEvent: false }),
      });
    }
    this.form.controls.customer.disable({ emitEvent: false });
  }

  private applyPreferredCustomer(customerId: number): void {
    this.form.patchValue({ customerId });
    const apply = (c: Customer) => {
      this.selectExistingCustomer(c);
      this.customerSearchControl.disable({ emitEvent: false });
    };
    const cached = this.customersApi.getCustomer(customerId);
    if (cached) {
      apply(cached);
      return;
    }
    this.customersApi.fetchCustomer(customerId).subscribe({
      next: apply,
      error: () => undefined,
    });
  }

  private customerSearchKey(
    value: string | Customer | typeof NEW_CUSTOMER_TOKEN | null
  ): string {
    if (!value) {
      return '';
    }
    if (value === NEW_CUSTOMER_TOKEN) {
      return NEW_CUSTOMER_TOKEN;
    }
    return typeof value === 'string' ? value : `id:${value.id}`;
  }
}