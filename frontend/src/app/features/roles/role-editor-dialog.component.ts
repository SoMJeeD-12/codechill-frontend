import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { PermissionGroup, PermissionItem, Role } from '../../core/models/permission.model';
import { RoleService } from '../../core/services/role.service';
import {
  PICKER_DEBOUNCE_MS,
  PICKER_MIN_CHARS,
} from '../../shared/components/entity-picker.component';

/** ชื่อโมดูลภาษาไทย — โมดูลที่ไม่รู้จักจะแสดงรหัสตามที่ API ส่งมา */
const MODULE_LABELS: Record<string, string> = {
  dashboard: 'หน้าแรก',
  user: 'ผู้ใช้งาน',
  role: 'บทบาทและสิทธิ์',
  permission: 'สิทธิ์',
  customer: 'ลูกค้า',
  contact: 'ผู้ติดต่อ',
  communication_log: 'ประวัติการติดต่อ',
  project: 'โปรเจกต์',
  task: 'งานย่อย',
  ticket: 'ปัญหา / ซัพพอร์ต',
  warranty: 'การรับประกัน',
  ma: 'สัญญาบำรุงรักษา',
  follow_up: 'ติดตามลูกค้า',
  followup: 'ติดตามลูกค้า',
  survey: 'แบบประเมิน',
  document: 'เอกสาร',
  file: 'ไฟล์แนบ',
  report: 'รายงาน',
  notification: 'การแจ้งเตือน',
  audit_log: 'บันทึกการใช้งาน',
};

@Component({
  selector: 'app-role-editor-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatCheckboxModule,
    MatExpansionModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  templateUrl: './role-editor-dialog.component.html',
  styleUrl: './role-editor-dialog.component.scss',
})
export class RoleEditorDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly rolesApi = inject(RoleService);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject(MatDialogRef<RoleEditorDialogComponent, boolean>);
  readonly data = inject<{ role: Role | null }>(MAT_DIALOG_DATA);

  readonly groups = signal<PermissionGroup[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  /** บทบาทที่ใช้เป็นเทมเพลตตอนสร้างใหม่ */
  readonly templateRoles = signal<Role[]>([]);
  readonly roleSuggestions = signal<Role[]>([]);
  readonly roleQueryReady = signal(false);
  /** ชื่อบทบาทที่คัดลอกสิทธิ์มา — แสดงคำใบ้ใต้ช่องชื่อ */
  readonly templateFromName = signal<string | null>(null);

  private readonly selected = signal<ReadonlySet<number>>(new Set<number>());
  readonly isCreate = !this.data.role;
  readonly form = this.fb.group({
    name: this.fb.nonNullable.control<string | Role>('', Validators.required),
    description: this.fb.nonNullable.control(''),
    isActive: this.fb.nonNullable.control(true),
  });

  constructor() {
    const role = this.data.role;
    if (role) {
      this.form.patchValue({
        name: role.name,
        description: role.description ?? '',
        isActive: role.isActive,
      });
      this.selected.set(new Set(role.permissions.map((p) => p.id)));
    }

    this.rolesApi.listPermissions().subscribe({
      next: (groups) => {
        this.groups.set(groups);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.error.set(err.message);
        this.loading.set(false);
      },
    });

    if (this.isCreate) {
      this.rolesApi.list({ limit: 100 }).subscribe({
        next: (roles) => this.templateRoles.set(roles),
        error: () => this.templateRoles.set([]),
      });
      this.form.controls.name.valueChanges
        .pipe(
          debounceTime(PICKER_DEBOUNCE_MS),
          distinctUntilChanged(),
          takeUntilDestroyed()
        )
        .subscribe((value) => this.onNameSearchChanged(value));
    }
  }

  readonly displayRoleName = (value: string | Role | null): string => {
    if (!value) {
      return '';
    }
    return typeof value === 'string' ? value : value.name;
  };

  onTemplateSelected(event: MatAutocompleteSelectedEvent): void {
    const value = event.option.value;
    if (!value || typeof value === 'string') {
      return;
    }
    const role = value as Role;
    this.applyPermissionTemplate(role);
    this.form.controls.name.setValue(role.name, { emitEvent: false });
    this.roleSuggestions.set([]);
    this.roleQueryReady.set(false);
  }

  moduleLabel(module: string): string {
    return MODULE_LABELS[module] ?? module;
  }

  permissionLabel(permission: PermissionItem): string {
    return permission.description || permission.code;
  }

  isChecked(permissionId: number): boolean {
    return this.selected().has(permissionId);
  }

  toggle(permissionId: number, checked: boolean): void {
    const next = new Set(this.selected());
    if (checked) {
      next.add(permissionId);
    } else {
      next.delete(permissionId);
    }
    this.selected.set(next);
  }

  isGroupChecked(group: PermissionGroup): boolean {
    return group.permissions.length > 0 && group.permissions.every((p) => this.isChecked(p.id));
  }

  isGroupPartial(group: PermissionGroup): boolean {
    const some = group.permissions.some((p) => this.isChecked(p.id));
    return some && !this.isGroupChecked(group);
  }

  groupSelectedCount(group: PermissionGroup): number {
    return group.permissions.filter((p) => this.isChecked(p.id)).length;
  }

  toggleGroup(group: PermissionGroup, checked: boolean): void {
    const next = new Set(this.selected());
    for (const p of group.permissions) {
      if (checked) {
        next.add(p.id);
      } else {
        next.delete(p.id);
      }
    }
    this.selected.set(next);
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const name =
      typeof raw.name === 'string'
        ? raw.name.trim()
        : (raw.name?.name ?? '').trim();
    if (!name) {
      this.form.controls.name.setErrors({ required: true });
      this.form.markAllAsTouched();
      return;
    }
    const permissionIds = Array.from(this.selected());
    const payload = {
      name,
      description: (raw.description ?? '').trim() || undefined,
      isActive: raw.isActive,
      permissionIds,
    };

    this.saving.set(true);
    this.error.set(null);
    const req$ = this.data.role
      ? this.rolesApi.update(this.data.role.id, payload)
      : this.rolesApi.create(payload);

    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.snack.open('บันทึกบทบาทแล้ว', 'ปิด', { duration: 2500 });
        this.ref.close(true);
      },
      error: (err: Error) => {
        this.saving.set(false);
        this.error.set(err.message);
      },
    });
  }

  private onNameSearchChanged(value: string | Role | null): void {
    if (typeof value !== 'string') {
      return;
    }
    const search = value.trim().toLowerCase();
    const from = this.templateFromName();
    if (from && search !== from.toLowerCase()) {
      this.templateFromName.set(null);
    }
    if (search.length < PICKER_MIN_CHARS) {
      this.roleQueryReady.set(false);
      this.roleSuggestions.set([]);
      return;
    }
    this.roleQueryReady.set(true);
    const matched = this.templateRoles().filter(
      (r) =>
        r.name.toLowerCase().includes(search) ||
        (r.description ?? '').toLowerCase().includes(search)
    );
    this.roleSuggestions.set(matched.slice(0, 10));
  }

  /** คัดลอกติ๊กสิทธิ์จากบทบาทที่มี — แก้ชื่อ/ติ๊กต่อได้ */
  private applyPermissionTemplate(role: Role): void {
    this.selected.set(new Set(role.permissions.map((p) => p.id)));
    if (role.description?.trim() && !this.form.controls.description.value.trim()) {
      this.form.patchValue({ description: role.description }, { emitEvent: false });
    }
    this.templateFromName.set(role.name);
  }
}
