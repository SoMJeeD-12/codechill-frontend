import { Component, computed, inject, signal } from '@angular/core';
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

/** คำอธิบายสั้นใต้แต่ละสิทธิ์ — เปิดเมนู/ปุ่มอะไร */
const PERMISSION_HINTS: Record<string, string> = {
  'ticket.support_queue': 'เมนูคิวซัพพอร์ต · ส่งหัวหน้า · บอกลูกค้า',
  'ticket.assign': 'เมนูคิวแอดมิน · รับคิว · มอบหมาย · ส่งกลับซัพพอร์ต',
  'ticket.view': 'เมนูปัญหา · งานของฉัน (ใบที่มอบให้ตัวเอง)',
  'ticket.create': 'ปุ่มเปิดใบแจ้งปัญหา',
  'ticket.update': 'แก้ไขรายละเอียดใบ',
  'ticket.resolve': 'บันทึกรอบแก้ / ปิดรอบแก้ไข',
  'ticket.reopen': 'เปิดปัญหาเดิมกลับมา',
  'ticket.close': 'ปิดใบแจ้งปัญหา',
  'ticket.delete': 'ลบใบ — ยังไม่มีผลบนหน้าจอหลัก',
  'project.view': 'เมนูโปรเจกต์',
  'project.create': 'สร้างโปรเจกต์',
  'project.update': 'แก้ไขโปรเจกต์',
  'project.delete': 'ลบโปรเจกต์ — ยังไม่มีผลบนหน้าจอหลัก',
  'task.view': 'เมนูงานโปรเจค',
  'task.create': 'เพิ่มงานย่อยในโปรเจกต์',
  'task.update': 'แก้งานย่อย · ส่งตรวจ',
  'task.assign': 'มอบหมายงานย่อย',
  'task.review': 'เมนูตรวจงานโปรเจค',
  'task.delete': 'ลบงานย่อย',
  'customer.view': 'เมนูลูกค้า · มุมมอง 360°',
  'customer.create': 'สร้างลูกค้า',
  'customer.update': 'แก้ไขลูกค้า',
  'customer.delete': 'ลบลูกค้า',
  'customer.export': 'ส่งออกลูกค้า',
  'followup.view': 'เมนูติดตามโปรเจค',
  'followup.create': 'สร้างงานติดตาม',
  'followup.update': 'แก้ไขงานติดตาม',
  'followup.complete': 'ปิดงานติดตาม',
  'followup.delete': 'ลบงานติดตาม',
  'communication.view': 'ดูประวัติการติดต่อ',
  'communication.create': 'บันทึกการติดต่อ',
  'communication.update': 'แก้ไขประวัติติดต่อ',
  'communication.delete': 'ลบประวัติติดต่อ',
  'ma.view': 'เมนูสัญญา MA',
  'ma.create': 'สร้างสัญญา MA',
  'ma.update': 'แก้ไขสัญญา MA',
  'ma.renew': 'ต่ออายุสัญญา MA',
  'ma.delete': 'ลบสัญญา MA — ยังไม่มีผลบนหน้าจอหลัก',
  'warranty.view': 'เมนูการรับประกัน',
  'warranty.create': 'ออกประกัน',
  'warranty.update': 'แก้ไขประกัน',
  'warranty.delete': 'ลบประกัน — ยังไม่มีผลบนหน้าจอหลัก',
  'document.view': 'ดูเอกสาร',
  'document.create': 'อัปโหลดเอกสาร',
  'document.update': 'แก้ไขเอกสาร',
  'document.delete': 'ลบเอกสาร',
  'report.view': 'เมนูรายงาน',
  'report.export': 'ส่งออกรายงาน',
  'survey.view': 'เมนูแบบประเมิน',
  'survey.create': 'สร้างแบบประเมิน',
  'survey.update': 'แก้ไขแบบประเมิน',
  'survey.delete': 'ลบแบบประเมิน',
  'notification.view': 'เมนูการแจ้งเตือน',
  'notification.manage': 'จัดการการแจ้งเตือน',
  'dashboard.view': 'เมนูหน้าแรก',
  'user.view': 'เมนูผู้ใช้',
  'user.create': 'สร้างผู้ใช้',
  'user.update': 'แก้ไขผู้ใช้',
  'role.view': 'เมนูบทบาท',
  'role.manage': 'จัดการบทบาท — สงวน Super Admin',
  'audit_log.view': 'เมนูประวัติการใช้งาน',
  'delivery.view': 'ดูการส่งมอบในโปรเจกต์',
  'delivery.create': 'บันทึกการส่งมอบ',
  'delivery.update': 'แก้ไขการส่งมอบ',
  'delivery.accept': 'ตรวจรับการส่งมอบ',
  'delivery.delete': 'ลบการส่งมอบ',
};

/** ลำดับกลุ่มในฟอร์ม */
type UiGroupId =
  | 'daily'
  | 'ticket_mgmt'
  | 'project'
  | 'customer'
  | 'ops'
  | 'admin'
  | 'unused';

interface UiGroupDef {
  id: UiGroupId;
  label: string;
  /** รหัสสิทธิ์ที่จัดเข้ากลุ่มนี้ — ลำดับในอาร์เรย์ = ลำดับแสดง */
  codes: string[];
  collapsedByDefault?: boolean;
  unused?: boolean;
}

const UI_GROUPS: UiGroupDef[] = [
  {
    id: 'daily',
    label: 'A. งานประจำวัน (ใบปัญหา)',
    codes: ['ticket.support_queue', 'ticket.assign', 'ticket.view'],
  },
  {
    id: 'ticket_mgmt',
    label: 'B. การจัดการใบ',
    codes: [
      'ticket.create',
      'ticket.update',
      'ticket.resolve',
      'ticket.reopen',
      'ticket.close',
    ],
  },
  {
    id: 'project',
    label: 'C. โปรเจค & งานโปรเจค',
    codes: [
      'project.view',
      'project.create',
      'project.update',
      'task.view',
      'task.create',
      'task.update',
      'task.assign',
      'task.review',
      'delivery.view',
      'delivery.create',
      'delivery.update',
      'delivery.accept',
    ],
  },
  {
    id: 'customer',
    label: 'D. ลูกค้า & ติดตาม & การติดต่อ',
    codes: [
      'customer.view',
      'customer.create',
      'customer.update',
      'customer.export',
      'followup.view',
      'followup.create',
      'followup.update',
      'followup.complete',
      'communication.view',
      'communication.create',
      'communication.update',
    ],
  },
  {
    id: 'ops',
    label: 'E. MA / ประกัน / เอกสาร / รายงาน / แบบประเมิน / แจ้งเตือน',
    codes: [
      'ma.view',
      'ma.create',
      'ma.update',
      'ma.renew',
      'warranty.view',
      'warranty.create',
      'warranty.update',
      'document.view',
      'document.create',
      'document.update',
      'document.delete',
      'report.view',
      'report.export',
      'survey.view',
      'survey.create',
      'survey.update',
      'notification.view',
      'notification.manage',
      'dashboard.view',
    ],
  },
  {
    id: 'admin',
    label: 'F. ผู้ใช้ & อื่น ๆ',
    codes: ['user.view', 'user.create', 'user.update', 'role.view', 'audit_log.view'],
  },
  {
    id: 'unused',
    label: 'G. สิทธิ์ที่ยังไม่ใช้ / ลบ',
    codes: [
      'ticket.delete',
      'project.delete',
      'task.delete',
      'customer.delete',
      'followup.delete',
      'communication.delete',
      'ma.delete',
      'warranty.delete',
      'delivery.delete',
      'survey.delete',
      'role.manage',
    ],
    collapsedByDefault: true,
    unused: true,
  },
];

interface RolePreset {
  id: string;
  label: string;
  description: string;
  /** รหัสสิทธิ์ที่จะติ๊ก — เฉพาะที่มีใน API */
  codes: string[];
}

const ROLE_PRESETS: RolePreset[] = [
  {
    id: 'support',
    label: 'ซัพพอร์ตรับเรื่อง',
    description: 'คิวซัพพอร์ต · เปิดใบ · ไม่จัดแจง',
    codes: [
      'ticket.view',
      'ticket.create',
      'ticket.update',
      'ticket.reopen',
      'ticket.close',
      'ticket.support_queue',
      'customer.view',
      'project.view',
      'ma.view',
      'warranty.view',
      'communication.view',
      'communication.create',
      'followup.view',
      'notification.view',
      'dashboard.view',
    ],
  },
  {
    id: 'resolver',
    label: 'พนักงานแก้ใบ',
    description: 'งานของฉัน · แก้ใบ · ไม่เข้าคิว',
    codes: [
      'ticket.view',
      'ticket.create',
      'ticket.update',
      'ticket.resolve',
      'project.view',
      'task.view',
      'task.update',
      'notification.view',
      'dashboard.view',
    ],
  },
  {
    id: 'lead',
    label: 'หัวหน้าจัดแจง',
    description: 'คิวแอดมิน · มอบหมาย',
    codes: [
      'ticket.view',
      'ticket.assign',
      'ticket.resolve',
      'ticket.close',
      'project.view',
      'task.view',
      'task.review',
      'customer.view',
      'notification.view',
      'dashboard.view',
      'report.view',
    ],
  },
  {
    id: 'sales',
    label: 'ดูแลลูกค้า/ขาย',
    description: 'ลูกค้า · ติดตาม · ไม่มีคิวใบ',
    codes: [
      'customer.view',
      'customer.create',
      'customer.update',
      'project.view',
      'followup.view',
      'followup.create',
      'followup.update',
      'followup.complete',
      'communication.view',
      'communication.create',
      'ma.view',
      'warranty.view',
      'notification.view',
      'dashboard.view',
    ],
  },
  {
    id: 'support_sales',
    label: 'ซัพพอร์ต+ขาย (รวม)',
    description: 'ซัพพอร์ต + ลูกค้า · ยังไม่มี assign',
    codes: [
      'ticket.view',
      'ticket.create',
      'ticket.update',
      'ticket.reopen',
      'ticket.close',
      'ticket.support_queue',
      'customer.view',
      'customer.create',
      'customer.update',
      'project.view',
      'followup.view',
      'followup.create',
      'followup.update',
      'communication.view',
      'communication.create',
      'ma.view',
      'warranty.view',
      'notification.view',
      'dashboard.view',
    ],
  },
];

/** เมนูที่จะเห็นจากสิทธิ์ที่ติ๊ก — สรุปให้คนตั้งบทบาท */
const MENU_PREVIEW_RULES: { label: string; requires: string[] }[] = [
  { label: 'หน้าแรก', requires: ['dashboard.view', 'ticket.view', 'task.view', 'followup.view', 'project.view'] },
  { label: 'โปรเจกต์', requires: ['project.view'] },
  { label: 'งานโปรเจค', requires: ['task.view'] },
  { label: 'ตรวจงานโปรเจค', requires: ['task.review'] },
  { label: 'คิวซัพพอร์ต', requires: ['ticket.support_queue'] },
  { label: 'คิวแอดมิน', requires: ['ticket.assign'] },
  { label: 'งานของฉัน', requires: ['ticket.view'] },
  { label: 'ปัญหา', requires: ['ticket.view'] },
  { label: 'ติดตามโปรเจค', requires: ['followup.view'] },
  { label: 'การแจ้งเตือน', requires: ['notification.view'] },
  { label: 'ลูกค้า', requires: ['customer.view'] },
  { label: 'มุมมอง 360°', requires: ['customer.view'] },
  { label: 'การรับประกัน', requires: ['warranty.view'] },
  { label: 'สัญญา MA', requires: ['ma.view'] },
  { label: 'แบบประเมิน', requires: ['survey.view'] },
  { label: 'รายงาน', requires: ['report.view'] },
  { label: 'ผู้ใช้', requires: ['user.view'] },
  { label: 'บทบาท', requires: ['role.view', 'role.manage'] },
  { label: 'ประวัติการใช้งาน', requires: ['audit_log.view', 'audit.view'] },
];

interface UiPermissionRow {
  item: PermissionItem;
  hint: string;
  locked: boolean;
}

interface UiSection {
  id: UiGroupId;
  label: string;
  unused: boolean;
  collapsedByDefault: boolean;
  rows: UiPermissionRow[];
}

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
  readonly templateRoles = signal<Role[]>([]);
  readonly roleSuggestions = signal<Role[]>([]);
  readonly roleQueryReady = signal(false);
  readonly templateFromName = signal<string | null>(null);
  readonly activePresetId = signal<string | null>(null);

  readonly presets = ROLE_PRESETS;

  private readonly selected = signal<ReadonlySet<number>>(new Set<number>());
  readonly isCreate = !this.data.role;
  readonly form = this.fb.group({
    name: this.fb.nonNullable.control<string | Role>('', Validators.required),
    description: this.fb.nonNullable.control(''),
    isActive: this.fb.nonNullable.control(true),
  });

  /** แผนที่ code → PermissionItem จาก API */
  private readonly byCode = computed(() => {
    const map = new Map<string, PermissionItem>();
    for (const g of this.groups()) {
      for (const p of g.permissions) {
        map.set(p.code, p);
      }
    }
    return map;
  });

  readonly uiSections = computed((): UiSection[] => {
    const map = this.byCode();
    const used = new Set<string>();
    const sections: UiSection[] = [];

    for (const def of UI_GROUPS) {
      const rows: UiPermissionRow[] = [];
      for (const code of def.codes) {
        const item = map.get(code);
        if (!item) {
          continue;
        }
        used.add(code);
        rows.push({
          item,
          hint: PERMISSION_HINTS[code] || item.description || code,
          locked: !!item.superAdminOnly,
        });
      }
      if (def.id === 'unused') {
        for (const [, item] of map) {
          if (used.has(item.code)) {
            continue;
          }
          rows.push({
            item,
            hint:
              PERMISSION_HINTS[item.code] ||
              item.description ||
              (item.superAdminOnly ? 'สงวนให้ Super Admin' : 'ยังไม่มีคำอธิบาย'),
            locked: !!item.superAdminOnly,
          });
          used.add(item.code);
        }
      }
      if (rows.length) {
        sections.push({
          id: def.id,
          label: def.label,
          unused: !!def.unused,
          collapsedByDefault: !!def.collapsedByDefault,
          rows,
        });
      }
    }
    return sections;
  });

  readonly menuPreview = computed(() => {
    const codes = new Set(
      Array.from(this.selected())
        .map((id) => this.findById(id)?.code)
        .filter((c): c is string => !!c)
    );
    return MENU_PREVIEW_RULES.filter((rule) =>
      rule.requires.some((r) => codes.has(r))
    ).map((r) => r.label);
  });

  readonly selectedCount = computed(() => this.selected().size);

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
    this.activePresetId.set(null);
  }

  applyPreset(preset: RolePreset): void {
    const map = this.byCode();
    const next = new Set<number>();
    let missing = 0;
    for (const code of preset.codes) {
      const item = map.get(code);
      if (!item) {
        missing += 1;
        continue;
      }
      if (item.superAdminOnly) {
        continue;
      }
      next.add(item.id);
    }
    this.selected.set(next);
    this.activePresetId.set(preset.id);
    this.templateFromName.set(null);
    if (!this.form.controls.description.value.trim()) {
      this.form.patchValue({ description: preset.description }, { emitEvent: false });
    }
    if (this.isCreate) {
      const nameCtrl = this.form.controls.name;
      const current =
        typeof nameCtrl.value === 'string' ? nameCtrl.value.trim() : nameCtrl.value?.name ?? '';
      if (!current) {
        nameCtrl.setValue(preset.label, { emitEvent: false });
      }
    }
    if (missing > 0) {
      this.snack.open(
        `ใช้ชุด「${preset.label}」แล้ว · มี ${missing} สิทธิ์ที่ API ยังไม่มี ข้ามไป`,
        'ปิด',
        { duration: 4000 }
      );
    }
  }

  isChecked(permissionId: number): boolean {
    return this.selected().has(permissionId);
  }

  toggle(permissionId: number, checked: boolean, locked: boolean): void {
    if (locked) {
      return;
    }
    const next = new Set(this.selected());
    if (checked) {
      next.add(permissionId);
    } else {
      next.delete(permissionId);
    }
    this.selected.set(next);
    this.activePresetId.set(null);
  }

  isSectionChecked(section: UiSection): boolean {
    const unlocked = section.rows.filter((r) => !r.locked);
    return unlocked.length > 0 && unlocked.every((r) => this.isChecked(r.item.id));
  }

  isSectionPartial(section: UiSection): boolean {
    const unlocked = section.rows.filter((r) => !r.locked);
    const some = unlocked.some((r) => this.isChecked(r.item.id));
    return some && !this.isSectionChecked(section);
  }

  sectionSelectedCount(section: UiSection): number {
    return section.rows.filter((r) => this.isChecked(r.item.id)).length;
  }

  toggleSection(section: UiSection, checked: boolean): void {
    const next = new Set(this.selected());
    for (const row of section.rows) {
      if (row.locked) {
        continue;
      }
      if (checked) {
        next.add(row.item.id);
      } else {
        next.delete(row.item.id);
      }
    }
    this.selected.set(next);
    this.activePresetId.set(null);
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

  private findById(id: number): PermissionItem | undefined {
    for (const g of this.groups()) {
      const found = g.permissions.find((p) => p.id === id);
      if (found) {
        return found;
      }
    }
    return undefined;
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

  private applyPermissionTemplate(role: Role): void {
    this.selected.set(new Set(role.permissions.map((p) => p.id)));
    if (role.description?.trim() && !this.form.controls.description.value.trim()) {
      this.form.patchValue({ description: role.description }, { emitEvent: false });
    }
    this.templateFromName.set(role.name);
  }
}
