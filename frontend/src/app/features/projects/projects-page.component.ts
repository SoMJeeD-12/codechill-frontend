import { Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
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
import { CodeLabelComponent } from '../../shared/components/code-label.component';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { createClientPager } from '../../shared/utils/client-pager';
import { openConfirmDialog } from '../../shared/components/confirm-dialog.component';
import { PICKER_DEBOUNCE_MS } from '../../shared/components/entity-picker.component';
import { FORM_DIALOG_WIDE } from '../../shared/utils/form-dialog';
import { createTableSort } from '../../shared/utils/table-sort';
import { ApiToastService } from '../../shared/services/api-toast.service';
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
    CodeLabelComponent,
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
  private readonly toast = inject(ApiToastService);
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

  /** คอลัมน์ที่จัดเรียงได้ */
  readonly tableSort = createTableSort<
    'code' | 'name' | 'customer' | 'status' | 'progress' | 'manager' | 'targetEndDate'
  >('code');

  readonly canUpdate = computed(() => {
    this.auth.session();
    return (
      this.auth.hasPermissionCode('project.update') ||
      this.auth.hasPermission('projects', 'update')
    );
  });
  readonly canDelete = computed(() => {
    // BE ยังไม่มี DELETE /api/projects/:id (Swagger มีแค่ GET/PUT) — ซ่อนกันกดแล้ว error ตอนสาธิต
    return false;
  });

  readonly filtered = computed(() => {
    const status = this.statusFilter();
    const list = this.projects().filter((p) => status === 'ALL' || p.status === status);
    const statusRank: Record<ProjectStatus, number> = {
      IN_PROGRESS: 0,
      DRAFT: 1,
      DELIVERED: 2,
      CLOSED: 3,
      CANCELLED: 4,
    };
    return this.tableSort.apply(list, (row, key) => {
      switch (key) {
        case 'code':
          return row.code || '';
        case 'name':
          return row.name;
        case 'customer':
          return this.customerName(row.customerId);
        case 'status':
          return statusRank[row.status];
        case 'progress':
          return this.progress(row.id) ?? -1;
        case 'manager':
          return row.manager?.fullName || '';
        case 'targetEndDate':
          return row.targetEndDate
            ? new Date(row.targetEndDate).getTime()
            : Number.MAX_SAFE_INTEGER;
      }
    });
  });

  readonly pager = createClientPager(this.filtered);

  ngOnInit(): void {
    this.reload();
    this.searchControl.valueChanges
      .pipe(debounceTime(PICKER_DEBOUNCE_MS), distinctUntilChanged())
      .subscribe((v) => {
        this.search.set(v);
        this.pager.reset();
        this.reload();
      });
  }

  setStatusFilter(status: ProjectStatus | 'ALL'): void {
    this.statusFilter.set(status);
    this.pager.reset();
  }

  toggleSort(
    key: 'code' | 'name' | 'customer' | 'status' | 'progress' | 'manager' | 'targetEndDate'
  ): void {
    this.tableSort.toggleSort(key);
    this.pager.reset();
  }

  sortIcon(
    key: 'code' | 'name' | 'customer' | 'status' | 'progress' | 'manager' | 'targetEndDate'
  ): string {
    return this.tableSort.sortIcon(key);
  }

  reload(): void {
    const q = this.search().trim();
    const params = q.length >= 2 ? { search: q, limit: 100 } : { limit: 100 };
    this.projectsApi.listProjects(params).subscribe((list) => this.projects.set(list));
  }

  customerName(id: number): string {
    return this.customersApi.getCustomer(id)?.name ?? `#${id}`;
  }

  progress(id: number): number | null {
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
        error: (err: Error) => this.toast.error(err),
      });
    });
  }

  private openForm(project?: Project): void {
    const ref = this.dialog.open(ProjectFormDialogComponent, {
      ...FORM_DIALOG_WIDE,
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

  /** วิซาร์ดสร้างโปรเจค — ห้ามข้ามขั้นที่ยังไม่ปลดล็อก */
  readonly createSteps = [
    { id: 'project', label: 'ข้อมูลโปรเจค' },
    { id: 'customer', label: 'ลูกค้า' },
    { id: 'contact', label: 'ผู้ติดต่อหลัก' },
  ] as const;
  readonly createStep = signal(0);
  /** ขั้นสูงสุดที่ไปถึงแล้ว (ผ่าน「ถัดไป」หรือเริ่มต้น) */
  readonly maxReachedStep = signal(0);

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
    customerId: [0],
    projectType: [''],
    contractValue: [null as number | null, Validators.min(0)],
    startDate: [null as Date | null],
    targetEndDate: [null as Date | null, endNotBeforeStartValidator],
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

    this.form.controls.startDate.valueChanges.subscribe(() => {
      this.form.controls.targetEndDate.updateValueAndValidity({ emitEvent: false });
    });

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
    const value = event.option.value as Customer;
    this.selectExistingCustomer(value);
  }

  /** ปุ่ม「ลูกค้าใหม่」— สลับไปโหมดกรอกฟอร์มในคอลัมน์นี้ */
  startNewCustomer(): void {
    if (!this.canCreateCustomer() || this.isEdit || this.customerLocked) {
      return;
    }
    this.selectNewCustomer();
  }

  /** ล้างการเลือกลูกค้า / ยกเลิกโหมดลูกค้าใหม่ */
  clearCustomerChoice(): void {
    if (this.isEdit || this.customerLocked) {
      return;
    }
    this.clearCustomerSelection(true);
    this.customerSuggestions.set([]);
    this.customerQueryReady.set(false);
    this.error.set(null);
  }

  goToCreateStep(index: number): void {
    if (this.isEdit || index < 0 || index > this.maxReachedStep()) {
      return;
    }
    this.createStep.set(index);
    this.error.set(null);
  }

  goCreateBack(): void {
    if (this.isEdit || this.createStep() <= 0) {
      return;
    }
    this.createStep.update((s) => s - 1);
    this.error.set(null);
  }

  goCreateNext(): void {
    if (this.isEdit) {
      return;
    }
    if (!this.validateCreateStep(this.createStep())) {
      return;
    }
    const next = this.createStep() + 1;
    this.createStep.set(next);
    this.maxReachedStep.update((m) => Math.max(m, next));
    this.error.set(null);
  }

  save(): void {
    if (!this.isEdit) {
      // บันทึกได้เฉพาะขั้นสุดท้าย — กันข้าม
      if (this.createStep() !== this.createSteps.length - 1) {
        this.goCreateNext();
        return;
      }
      if (!this.validateCreateStep(2)) {
        return;
      }
    }

    this.syncCustomerValidators();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      if (this.form.controls.targetEndDate.hasError('endBeforeStart')) {
        this.error.set('กำหนดส่งมอบต้องไม่ก่อนวันเริ่มโปรเจค');
      } else if (
        !this.isEdit &&
        this.form.controls.contact.controls.name.invalid &&
        (this.customerMode() === 'new' || this.customerMode() === 'existing')
      ) {
        this.error.set('กรุณาระบุชื่อผู้ติดต่อหลัก เพื่อใช้เป็นผู้รับมอบตอนส่งมอบ');
      } else {
        this.error.set(null);
      }
      return;
    }

    if (this.isEdit && this.data.project) {
      this.saveEdit(this.data.project.id);
      return;
    }
    this.saveCreate();
  }

  /** ตรวจขั้นปัจจุบันก่อนไปต่อ / บันทึก */
  private validateCreateStep(step: number): boolean {
    this.syncCustomerValidators();
    if (step === 0) {
      const controls = [
        this.form.controls.name,
        this.form.controls.priority,
        this.form.controls.status,
        this.form.controls.contractValue,
        this.form.controls.startDate,
        this.form.controls.targetEndDate,
      ];
      const invalid = controls.some((c) => c.invalid);
      if (invalid) {
        controls.forEach((c) => c.markAsTouched());
        if (this.form.controls.targetEndDate.hasError('endBeforeStart')) {
          this.error.set('กำหนดส่งมอบต้องไม่ก่อนวันเริ่มโปรเจค');
        } else if (this.form.controls.name.invalid) {
          this.error.set('กรอกชื่อโปรเจคก่อนไปขั้นถัดไป');
        } else {
          this.error.set('กรอกข้อมูลโปรเจคให้ครบก่อนไปขั้นถัดไป');
        }
        return false;
      }
      return true;
    }

    if (step === 1) {
      const mode = this.customerMode();
      if (mode === 'none') {
        this.error.set('เลือกลูกค้าหรือสร้างลูกค้าใหม่ก่อนไปขั้นถัดไป');
        this.customerSearchControl.markAsTouched();
        return false;
      }
      const customer = this.form.controls.customer;
      if (customer.invalid) {
        customer.markAllAsTouched();
        this.error.set(
          customer.controls.name.invalid
            ? 'กรอกชื่อบริษัทก่อนไปขั้นถัดไป'
            : 'ตรวจข้อมูลลูกค้าให้ถูกต้องก่อนไปขั้นถัดไป'
        );
        return false;
      }
      return true;
    }

    if (step === 2) {
      const mode = this.customerMode();
      if (mode === 'none') {
        this.error.set('เลือกลูกค้าก่อนบันทึก');
        this.createStep.set(1);
        return false;
      }
      const contact = this.form.controls.contact;
      if (contact.invalid) {
        contact.markAllAsTouched();
        this.error.set(
          contact.controls.name.invalid
            ? 'กรุณาระบุชื่อผู้ติดต่อหลัก เพื่อใช้เป็นผู้รับมอบตอนส่งมอบ'
            : 'ตรวจข้อมูลผู้ติดต่อให้ถูกต้องก่อนบันทึก'
        );
        return false;
      }
      return true;
    }

    return true;
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
        next: ({ project, message }) => {
          this.saving.set(false);
          const codeHint = project.code?.trim() ? ` · รหัส ${project.code.trim()}` : '';
          const text =
            message?.trim() ||
            (codeHint ? `สร้างโปรเจคแล้ว${codeHint}` : 'บันทึกโปรเจคแล้ว');
          this.snack.open(text, 'ปิด', { duration: message || codeHint ? 5000 : 2500 });
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
      if (this.customerMode() === 'new') {
        chain$ = chain$.pipe(
          switchMap(() => this.customersApi.saveContact(customerId, contact))
        );
      } else {
        // ลูกค้าเดิม — สร้างผู้ติดต่อเฉพาะเมื่อยังไม่มี (กันซ้ำตอน prefill)
        chain$ = chain$.pipe(
          switchMap(() => this.customersApi.listContacts(customerId)),
          switchMap((contacts) =>
            contacts.length > 0
              ? of(null)
              : this.customersApi.saveContact(customerId, contact)
          )
        );
      }
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
      projectType: (raw.projectType ?? '').trim() || undefined,
      contractValue: raw.contractValue == null ? undefined : String(raw.contractValue),
      startDate: toDateOnlyString(raw.startDate) || undefined,
      targetEndDate: toDateOnlyString(raw.targetEndDate) || undefined,
      // สถานะเดินตาม workflow บนหน้ารายละเอียด — ฟอร์มสร้าง/แก้ไม่เปลี่ยนสถานะ
      status: this.isEdit
        ? (this.data.project?.status ?? 'DRAFT')
        : 'DRAFT',
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
    const contactNameCtrl = this.form.controls.contact.controls.name;
    const needCustomer =
      !this.isEdit && (this.customerMode() === 'new' || this.customerMode() === 'existing');
    if (needCustomer) {
      nameCtrl.setValidators([Validators.required]);
      contactNameCtrl.setValidators([Validators.required]);
    } else {
      nameCtrl.clearValidators();
      contactNameCtrl.clearValidators();
    }
    nameCtrl.updateValueAndValidity({ emitEvent: false });
    contactNameCtrl.updateValueAndValidity({ emitEvent: false });
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
    this.clearContactFields();
    this.customerSearchControl.setValue(customer, { emitEvent: false });
    this.customerSuggestions.set([]);
    this.customerQueryReady.set(false);
    this.error.set(null);
    this.syncCustomerValidators();
    this.prefillPrimaryContact(customer.id);
  }

  private selectNewCustomer(): void {
    this.customerMode.set('new');
    this.selectedCustomerSnapshot = null;
    this.form.patchValue({ customerId: 0 });
    this.clearCustomerFields();
    this.clearContactFields();
    this.customerSearchControl.setValue(NEW_CUSTOMER_TOKEN, { emitEvent: false });
    this.customerSuggestions.set([]);
    this.customerQueryReady.set(false);
    this.error.set(null);
    this.syncCustomerValidators();
  }

  private clearCustomerSelection(clearSearch: boolean): void {
    this.customerMode.set('none');
    this.selectedCustomerSnapshot = null;
    this.form.patchValue({ customerId: 0 });
    this.clearCustomerFields();
    this.clearContactFields();
    this.syncCustomerValidators();
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

  private clearContactFields(): void {
    this.form.controls.contact.reset({
      name: '',
      phone: '',
      email: '',
      position: '',
    });
  }

  /** เติมผู้ติดต่อหลักของลูกค้าเดิม — มีแล้วส่งมอบได้ทันที / ยังไม่มีต้องกรอก */
  private prefillPrimaryContact(customerId: number): void {
    this.customersApi.listContacts(customerId).subscribe({
      next: (contacts) => {
        if (this.customerMode() !== 'existing' || this.form.controls.customerId.value !== customerId) {
          return;
        }
        const primary = contacts.find((c) => c.isPrimary) ?? contacts[0];
        if (!primary) {
          return;
        }
        this.form.controls.contact.patchValue({
          name: primary.name ?? '',
          phone: sanitizePhoneDigits(primary.phone),
          email: primary.email ?? '',
          position: primary.position ?? '',
        });
      },
      error: () => undefined,
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

/** กำหนดส่งมอบต้องไม่ก่อนวันเริ่มโปรเจค */
const endNotBeforeStartValidator: ValidatorFn = (
  control: AbstractControl
): ValidationErrors | null => {
  const end = control.value as Date | null | undefined;
  const start = control.parent?.get('startDate')?.value as Date | null | undefined;
  if (!start || !end) {
    return null;
  }
  const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return endDay < startDay ? { endBeforeStart: true } : null;
};