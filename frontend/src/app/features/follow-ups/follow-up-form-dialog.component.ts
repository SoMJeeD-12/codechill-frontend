import { Component, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import {
  FOLLOW_UP_STATUS_LABELS,
  FollowUp,
  FollowUpProjectSummary,
  FollowUpWritableStatus,
} from '../../core/models/follow-up.model';
import { Project, ProjectOption } from '../../core/models/project.model';
import { AuthService } from '../../core/services/auth.service';
import { CustomerService } from '../../core/services/customer.service';
import {
  FollowUpCreateInput,
  FollowUpService,
  FollowUpUpdateInput,
} from '../../core/services/follow-up.service';
import { ProjectService } from '../../core/services/project.service';
import { UserService } from '../../core/services/user.service';
import { parseDateOnly, toDateOnlyString } from '../../core/utils/date.util';
import { projectPickerOption } from '../../shared/components/entity-search';
import { UserOptionComponent } from '../../shared/components/user-option.component';

/** preset เมื่อสร้างจากหน้าโปรเจกต์/ลูกค้า */
export type FollowUpFormPreset = {
  customerId?: number;
  customerName?: string | null;
  projectId?: number;
  project?: FollowUpProjectSummary | null;
};

export type FollowUpFormDialogData = FollowUp | FollowUpFormPreset | null;

type ProjectPick = Project | ProjectOption | FollowUpProjectSummary;

const PROJECT_OPTIONS_LIMIT = 20;
const PROJECT_REQUIRED_MESSAGE = 'กรุณาเลือกโปรเจกต์ที่ต้องติดตาม';

function isFollowUpRow(data: FollowUpFormDialogData): data is FollowUp {
  return !!data && typeof (data as FollowUp).id === 'number' && (data as FollowUp).id > 0;
}

function projectPicked(control: AbstractControl): ValidationErrors | null {
  return control.value && typeof control.value === 'object' ? null : { required: true };
}

/**
 * สร้าง/แก้ไขงานติดตาม — ต้องผูกโปรเจกต์ทุกงาน (backend ดึงลูกค้าจากเจ้าของโปรเจกต์เอง)
 * - สร้างจากหน้าโปรเจกต์: ล็อกโปรเจกต์
 * - สร้างจากหน้าลูกค้า / แก้ไข: เลือกได้เฉพาะโปรเจกต์ของลูกค้ารายนั้น
 * - สร้างจากหน้างานติดตาม: พิมพ์ค้นจาก GET /projects/options
 */
@Component({
  selector: 'app-follow-up-form-dialog',
  standalone: true,
  imports: [
    UserOptionComponent,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatSnackBarModule,
    MatDatepickerModule,
    MatAutocompleteModule,
  ],
  templateUrl: './follow-up-form-dialog.component.html',
  styleUrl: './follow-up-form-dialog.component.scss',
})
export class FollowUpFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(FollowUpService);
  private readonly customersApi = inject(CustomerService);
  private readonly projectsApi = inject(ProjectService);
  private readonly usersApi = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject(MatDialogRef<FollowUpFormDialogComponent, boolean>);
  readonly data = inject<FollowUpFormDialogData>(MAT_DIALOG_DATA);

  readonly users = this.usersApi.assignableTask;
  readonly statuses = Object.keys(FOLLOW_UP_STATUS_LABELS) as FollowUpWritableStatus[];
  readonly statusLabels = FOLLOW_UP_STATUS_LABELS;
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  private readonly editRow: FollowUp | null = isFollowUpRow(this.data) ? this.data : null;
  readonly isEdit = !!this.editRow;
  readonly projectLocked = !this.isEdit && !!this.presetProjectId();
  /** แก้ไข (ย้ายลูกค้าไม่ได้) / สร้างจากหน้าลูกค้า */
  readonly scopeCustomerId: number | null = this.projectLocked
    ? null
    : (this.editRow?.customerId ?? this.presetCustomerId() ?? null);
  /** งานเก่าก่อนบังคับผูกโปรเจกต์ */
  readonly legacyNoProject = !!this.editRow && this.editRow.projectId == null;

  readonly customerProjects = signal<Project[]>([]);
  readonly customerProjectsLoading = signal(false);
  private readonly customerProjectsLoaded = signal(false);
  readonly noCustomerProjects = computed(
    () =>
      this.scopeCustomerId != null &&
      this.customerProjectsLoaded() &&
      this.customerProjects().length === 0
  );

  private readonly openFollowUps = signal<FollowUp[]>([]);
  /** โปรเจกต์ที่มีงานติดตามค้าง (PLANNED) และยังไม่เลยกำหนด — ห้ามสร้างซ้ำ */
  readonly blockedProjects = computed(() => {
    const map = new Map<number, FollowUp>();
    for (const f of this.openFollowUps()) {
      if (f.projectId == null || f.status !== 'PLANNED' || f.isOverdue || f.id === this.editRow?.id) {
        continue;
      }
      const prev = map.get(f.projectId);
      if (!prev || f.dueDate > prev.dueDate) {
        map.set(f.projectId, f);
      }
    }
    return map;
  });

  readonly projectSuggestions = signal<ProjectPick[]>([]);
  readonly projectQueryReady = signal(false);
  readonly projectSearching = signal(false);
  readonly selectedProject = signal<ProjectPick | null>(this.initialSelectedProject());
  /** ลูกค้าเจ้าของโปรเจกต์ — แสดงอย่างเดียว */
  readonly customerName = signal<string | null>(this.initialCustomerName());
  readonly customerNameLoading = signal(false);
  readonly canSave = computed(() => !this.saving() && !!this.selectedProject());

  readonly projectSearchControl = this.fb.control<string | ProjectPick>('', projectPicked);

  readonly form = this.fb.group({
    projectId: [
      this.initialSelectedProject()?.id ?? (null as number | null),
      [Validators.required, Validators.min(1)],
    ],
    title: [this.editRow?.title ?? '', Validators.required],
    dueDate: [parseDateOnly(this.editRow?.dueDate) as Date | null, Validators.required],
    assignedUserId: [this.editRow?.assignedUserId ?? (null as number | null)],
    status: [
      (this.editRow?.status === 'OVERDUE'
        ? 'PLANNED'
        : (this.editRow?.status ?? 'PLANNED')) as FollowUpWritableStatus,
    ],
    detail: [this.editRow?.detail ?? ''],
    resultNote: [this.editRow?.resultNote ?? ''],
  });

  private customerProjectsSub?: Subscription;
  private projectOptionsSub?: Subscription;
  private openFollowUpsSub?: Subscription;
  private customerNameSub?: Subscription;

  constructor() {
    if (!this.isEdit) {
      const me = this.auth.currentUser();
      this.form.patchValue({ assignedUserId: me?.id ?? null, dueDate: new Date() });
    }

    const selected = this.selectedProject();
    if (selected) {
      this.projectSearchControl.setValue(selected, { emitEvent: false });
    }

    if (this.projectLocked) {
      this.projectSearchControl.disable({ emitEvent: false });
      if (selected) {
        this.loadOpenFollowUps({ projectId: selected.id });
        if (!this.customerName()) {
          this.resolveCustomerName(selected);
        }
      }
      return;
    }

    this.projectSearchControl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged((a, b) => this.projectSearchKey(a) === this.projectSearchKey(b))
      )
      .subscribe((value) => this.onProjectSearchChanged(value));

    if (this.scopeCustomerId != null) {
      this.loadCustomerProjects(this.scopeCustomerId);
      this.loadOpenFollowUps({ customerId: this.scopeCustomerId });
    }
  }

  blockedFor(projectId: number): FollowUp | undefined {
    return this.blockedProjects().get(projectId);
  }

  formatDue(dueDate: string): string {
    const d = parseDateOnly(dueDate);
    return d
      ? d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
      : dueDate;
  }

  projectPlaceholder(): string {
    if (this.customerProjectsLoading()) {
      return 'กำลังโหลดโปรเจกต์…';
    }
    if (this.noCustomerProjects()) {
      return 'ลูกค้ารายนี้ยังไม่มีโปรเจกต์';
    }
    return 'พิมพ์รหัสหรือชื่อโปรเจกต์';
  }

  customerDisplay(): string {
    if (this.customerNameLoading()) {
      return 'กำลังโหลด…';
    }
    return this.customerName() ?? '';
  }

  readonly displayProject = (value: string | ProjectPick | null): string => {
    if (!value) {
      return '';
    }
    if (typeof value === 'string') {
      return value;
    }
    return value.name;
  };

  projectStatusBadge(p: ProjectPick): string | null {
    if (!('status' in p)) {
      return null;
    }
    return projectPickerOption(p as ProjectOption).badge ?? null;
  }

  onProjectSelected(event: MatAutocompleteSelectedEvent): void {
    this.selectProject(event.option.value as ProjectPick);
  }

  onProjectFieldFocus(): void {
    if (this.projectLocked || this.selectedProject() || this.projectSuggestions().length) {
      return;
    }
    const raw = this.projectSearchControl.value;
    this.loadProjectSuggestions(typeof raw === 'string' ? raw.trim() : '');
  }

  save(): void {
    const project = this.selectedProject();
    if (!project) {
      this.projectSearchControl.markAsTouched();
      this.error.set(PROJECT_REQUIRED_MESSAGE);
      return;
    }
    const blocking = this.blockedFor(project.id);
    if (blocking) {
      this.error.set(this.blockedMessage(blocking));
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);

    if (this.isEdit && this.editRow) {
      const payload: FollowUpUpdateInput = {
        title: raw.title ?? '',
        dueDate: toDateOnlyString(raw.dueDate),
        assignedUserId: raw.assignedUserId,
        status: (raw.status as FollowUpWritableStatus) ?? 'PLANNED',
        detail: raw.detail ?? '',
        resultNote: raw.resultNote ?? '',
        projectId: project.id,
      };
      this.api.update(this.editRow.id, payload).subscribe({
        next: (row) => this.onSaved(row, true),
        error: (err: Error) => this.onError(err),
      });
      return;
    }

    const payload: FollowUpCreateInput = {
      projectId: project.id,
      title: raw.title ?? '',
      dueDate: toDateOnlyString(raw.dueDate),
      assignedUserId: raw.assignedUserId,
      detail: raw.detail ?? '',
    };
    this.api.create(payload).subscribe({
      next: (row) => this.onSaved(row, false),
      error: (err: Error) => this.onError(err),
    });
  }

  private onSaved(row: FollowUp, isEdit: boolean): void {
    this.saving.set(false);
    this.snack.open(
      row.isOverdue
        ? 'บันทึกแล้ว — รายการนี้อยู่ในหมวดเลยกำหนด'
        : isEdit
          ? 'บันทึกแล้ว'
          : 'สร้างงานติดตามแล้ว',
      'ปิด',
      { duration: 2800 }
    );
    this.ref.close(true);
  }

  private onError(err: Error): void {
    this.saving.set(false);
    this.error.set(err.message);
  }

  private blockedMessage(blocking: FollowUp): string {
    return `โปรเจกต์นี้มีงานติดตาม「${blocking.title}」ค้างอยู่ ครบกำหนด ${this.formatDue(blocking.dueDate)} — ปิดงานเดิมก่อนหรือแก้ไขงานเดิมแทน`;
  }

  private selectProject(project: ProjectPick): void {
    this.selectedProject.set(project);
    this.form.patchValue({ projectId: project.id });
    this.projectSearchControl.setValue(project, { emitEvent: false });
    this.projectSuggestions.set([]);
    this.projectQueryReady.set(false);
    this.error.set(null);
    if (this.scopeCustomerId == null) {
      this.resolveCustomerName(project);
      this.loadOpenFollowUps({ projectId: project.id });
    } else {
      this.warnIfBlocked();
    }
  }

  private clearSelection(): void {
    this.selectedProject.set(null);
    this.form.patchValue({ projectId: null });
    if (this.scopeCustomerId == null) {
      this.customerNameSub?.unsubscribe();
      this.customerNameLoading.set(false);
      this.customerName.set(null);
    }
  }

  private onProjectSearchChanged(value: string | ProjectPick | null): void {
    if (typeof value !== 'string') {
      return;
    }
    const search = value.trim();
    const selected = this.selectedProject();
    if (selected && this.displayProject(selected) !== search) {
      this.clearSelection();
    }
    this.loadProjectSuggestions(search);
  }

  private loadProjectSuggestions(search: string): void {
    if (this.scopeCustomerId != null) {
      if (this.customerProjectsLoading()) {
        return;
      }
      const q = search.toLowerCase();
      this.projectQueryReady.set(true);
      this.projectSuggestions.set(
        this.customerProjects().filter(
          (p) => !q || p.name.toLowerCase().includes(q) || (p.code ?? '').toLowerCase().includes(q)
        )
      );
      return;
    }
    this.projectOptionsSub?.unsubscribe();
    this.projectSearching.set(true);
    this.projectOptionsSub = this.projectsApi
      .listProjectOptions({ search, limit: PROJECT_OPTIONS_LIMIT })
      .subscribe({
        next: (list) => {
          this.projectSearching.set(false);
          this.projectSuggestions.set(list);
          this.projectQueryReady.set(true);
        },
        error: (err: Error) => {
          this.projectSearching.set(false);
          this.error.set(err.message);
        },
      });
  }

  private loadCustomerProjects(customerId: number): void {
    this.customerProjectsSub?.unsubscribe();
    this.customerProjects.set([]);
    this.customerProjectsLoaded.set(false);
    this.customerProjectsLoading.set(true);
    this.syncProjectInputEnabled();
    this.customerProjectsSub = this.projectsApi.listProjectsByCustomer(customerId).subscribe({
      next: (list) => {
        this.customerProjectsLoading.set(false);
        this.customerProjectsLoaded.set(true);
        this.customerProjects.set(list);
        if (!this.customerName()) {
          const owner = list.find((p) => p.customer?.name)?.customer?.name;
          if (owner) {
            this.customerName.set(owner);
          }
        }
        this.syncProjectInputEnabled();
      },
      error: (err: Error) => {
        this.customerProjectsLoading.set(false);
        this.error.set(err.message);
        this.syncProjectInputEnabled();
      },
    });
  }

  private loadOpenFollowUps(scope: { customerId: number } | { projectId: number }): void {
    this.openFollowUpsSub?.unsubscribe();
    this.openFollowUps.set([]);
    this.openFollowUpsSub = this.api
      .listPage({ ...scope, status: 'PLANNED', page: 1, limit: 100 })
      .subscribe({
        next: (res) => {
          this.openFollowUps.set(res.items);
          this.warnIfBlocked();
        },
        error: () => this.openFollowUps.set([]),
      });
  }

  private warnIfBlocked(): void {
    const selected = this.selectedProject();
    const blocking = selected ? this.blockedFor(selected.id) : undefined;
    if (blocking && !this.projectLocked) {
      this.error.set(this.blockedMessage(blocking));
    }
  }

  /** ProjectOption ไม่มีข้อมูลลูกค้า — ดึงโปรเจกต์เต็มมาเอาชื่อเจ้าของ */
  private resolveCustomerName(project: ProjectPick): void {
    this.customerNameSub?.unsubscribe();
    const known = 'customer' in project ? project.customer?.name : null;
    if (known) {
      this.customerNameLoading.set(false);
      this.customerName.set(known);
      return;
    }
    this.customerNameLoading.set(true);
    this.customerNameSub = this.projectsApi.fetchProject(project.id).subscribe({
      next: (full) => {
        this.customerNameLoading.set(false);
        if (this.selectedProject()?.id !== project.id) {
          return;
        }
        this.customerName.set(
          full.customer?.name ??
            this.customersApi.getCustomer(full.customerId)?.name ??
            `ลูกค้า #${full.customerId}`
        );
      },
      error: () => {
        this.customerNameLoading.set(false);
        this.customerName.set(null);
      },
    });
  }

  private syncProjectInputEnabled(): void {
    const ctrl = this.projectSearchControl;
    const enable = !this.projectLocked && !this.customerProjectsLoading() && !this.noCustomerProjects();
    if (enable && ctrl.disabled) {
      ctrl.enable({ emitEvent: false });
    } else if (!enable && ctrl.enabled) {
      ctrl.disable({ emitEvent: false });
    }
  }

  private projectSearchKey(value: string | ProjectPick | null): string {
    if (!value) {
      return '';
    }
    if (typeof value === 'string') {
      return value.trim().toLowerCase();
    }
    return `id:${value.id}`;
  }

  private initialSelectedProject(): ProjectPick | null {
    if (this.editRow?.projectId != null) {
      return (
        this.editRow.project ?? { id: this.editRow.projectId, code: null, name: `#${this.editRow.projectId}` }
      );
    }
    const preset = this.data && !isFollowUpRow(this.data) ? this.data : null;
    if (preset?.projectId) {
      return preset.project ?? { id: preset.projectId, code: null, name: `#${preset.projectId}` };
    }
    return null;
  }

  private initialCustomerName(): string | null {
    if (this.editRow) {
      return (
        this.editRow.customer?.name ??
        this.customersApi.getCustomer(this.editRow.customerId)?.name ??
        `ลูกค้า #${this.editRow.customerId}`
      );
    }
    const preset = this.data && !isFollowUpRow(this.data) ? this.data : null;
    if (!preset) {
      return null;
    }
    if (preset.customerName) {
      return preset.customerName;
    }
    return preset.customerId ? (this.customersApi.getCustomer(preset.customerId)?.name ?? null) : null;
  }

  private presetCustomerId(): number | undefined {
    if (!this.data || isFollowUpRow(this.data)) {
      return undefined;
    }
    return this.data.customerId;
  }

  private presetProjectId(): number | undefined {
    if (!this.data || isFollowUpRow(this.data)) {
      return undefined;
    }
    return this.data.projectId;
  }
}
