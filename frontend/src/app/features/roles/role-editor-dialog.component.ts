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
import { MatIconModule } from '@angular/material/icon';
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

/** ชื่อสั้นไทย — หัวข้อหลักของแต่ละสิทธิ์ */
const PERMISSION_LABELS: Record<string, string> = {
  'ticket.support_queue': 'คิวซัพพอร์ต',
  'ticket.assign': 'คิวแอดมิน / มอบหมาย',
  'ticket.view': 'ดูใบปัญหา',
  'ticket.create': 'เปิดใบใหม่',
  'ticket.update': 'แก้ไขใบ',
  'ticket.resolve': 'บันทึกรอบแก้',
  'ticket.reopen': 'เปิดใบกลับ',
  'ticket.close': 'ปิดใบ',
  'ticket.delete': 'ลบใบ',
  'project.view': 'ดูโปรเจกต์',
  'project.create': 'สร้างโปรเจกต์',
  'project.update': 'แก้ไขโปรเจกต์',
  'project.delete': 'ลบโปรเจกต์',
  'task.view': 'งานโปรเจกต์',
  'task.create': 'เพิ่มงานย่อย',
  'task.update': 'แก้งานย่อย',
  'task.assign': 'มอบหมายงานย่อย',
  'task.review': 'ตรวจงานโปรเจกต์',
  'task.delete': 'ลบงานย่อย',
  'customer.view': 'ดูลูกค้า',
  'customer.create': 'สร้างลูกค้า',
  'customer.update': 'แก้ไขลูกค้า',
  'customer.delete': 'ลบลูกค้า',
  'customer.export': 'ส่งออกลูกค้า',
  'followup.view': 'งานติดตาม',
  'followup.create': 'สร้างงานติดตาม',
  'followup.update': 'แก้ไขงานติดตาม',
  'followup.complete': 'ปิดงานติดตาม',
  'followup.delete': 'ลบงานติดตาม',
  'communication.view': 'ดูประวัติติดต่อ',
  'communication.create': 'บันทึกการติดต่อ',
  'communication.update': 'แก้ไขประวัติติดต่อ',
  'communication.delete': 'ลบประวัติติดต่อ',
  'ma.view': 'แผน MA / สัญญาในโปรเจกต์',
  'ma.create': 'สร้างสัญญา MA',
  'ma.update': 'แก้ไขสัญญา MA',
  'ma.renew': 'ต่ออายุ MA',
  'ma.delete': 'ลบสัญญา MA',
  'warranty.view': 'การรับประกัน',
  'warranty.create': 'ออกประกัน',
  'warranty.update': 'แก้ไขประกัน',
  'warranty.delete': 'ลบประกัน',
  'document.view': 'ดูเอกสาร',
  'document.create': 'อัปโหลดเอกสาร',
  'document.update': 'แก้ไขเอกสาร',
  'document.delete': 'ลบเอกสาร',
  'report.view': 'รายงาน',
  'report.export': 'ส่งออกรายงาน',
  'survey.view': 'แบบประเมิน',
  'survey.create': 'สร้างแบบประเมิน',
  'survey.send': 'ส่ง / บันทึกคำตอบ',
  'survey.update': 'แก้ไขแบบประเมิน',
  'survey.delete': 'ลบแบบประเมิน',
  'notification.view': 'การแจ้งเตือน',
  'notification.manage': 'จัดการแจ้งเตือน',
  'dashboard.view': 'หน้าแรก',
  'user.view': 'ผู้ใช้',
  'user.create': 'สร้างผู้ใช้',
  'user.update': 'แก้ไขผู้ใช้',
  'role.view': 'บทบาท',
  'role.manage': 'จัดการบทบาท',
  'audit_log.view': 'ประวัติการใช้งาน',
  'delivery.view': 'ดูการส่งมอบ',
  'delivery.create': 'บันทึกส่งมอบ',
  'delivery.update': 'แก้ไขส่งมอบ',
  'delivery.accept': 'ตรวจรับส่งมอบ',
  'delivery.delete': 'ลบส่งมอบ',
};

/** คำอธิบาย 1 บรรทัด — เปิดเมนู/ปุ่มอะไร */
const PERMISSION_HINTS: Record<string, string> = {
  'ticket.support_queue': 'เมนูคิวซัพพอร์ต · ส่งหัวหน้า · บอกลูกค้า',
  'ticket.assign': 'เมนูคิวแอดมิน · รับคิว · มอบหมาย · ส่งกลับซัพพอร์ต',
  'ticket.view': 'เมนูปัญหา · ใบของฉัน (ใบที่มอบให้ตัวเอง)',
  'ticket.create': 'ปุ่มเปิดใบแจ้งปัญหา',
  'ticket.update': 'แก้ไขรายละเอียดใบ',
  'ticket.resolve': 'บันทึกรอบแก้ / ปิดรอบแก้ไข',
  'ticket.reopen': 'เปิดปัญหาเดิมกลับมา',
  'ticket.close': 'ปิดใบแจ้งปัญหา',
  'ticket.delete': 'ลบใบ — ยังไม่มีผลในระบบ',
  'project.view': 'เมนูโปรเจกต์',
  'project.create': 'สร้างโปรเจกต์',
  'project.update': 'แก้ไขโปรเจกต์',
  'project.delete': 'ลบโปรเจกต์ — ยังไม่มีผลในระบบ',
  'task.view': 'เมนูงานโปรเจกต์',
  'task.create': 'เพิ่มงานย่อยในโปรเจกต์',
  'task.update': 'แก้งานย่อย · ส่งตรวจ',
  'task.assign': 'มอบหมายงานย่อย',
  'task.review': 'เมนูงานตรวจ',
  'task.delete': 'ลบงานย่อย',
  'customer.view': 'เมนูลูกค้า · มุมมอง 360°',
  'customer.create': 'สร้างลูกค้า',
  'customer.update': 'แก้ไขลูกค้า',
  'customer.delete': 'ลบลูกค้า',
  'customer.export': 'ส่งออกลูกค้า',
  'followup.view': 'เมนูงานติดตาม',
  'followup.create': 'สร้างงานติดตาม',
  'followup.update': 'แก้ไขงานติดตาม',
  'followup.complete': 'ปิดงานติดตาม',
  'followup.delete': 'ลบงานติดตาม',
  'communication.view': 'ดูประวัติการติดต่อ',
  'communication.create': 'บันทึกการติดต่อ',
  'communication.update': 'แก้ไขประวัติติดต่อ',
  'communication.delete': 'ลบประวัติติดต่อ',
  'ma.view': 'เมนูสัญญา MA + ดูสัญญาในแท็บโปรเจกต์',
  'ma.create': 'สร้างสัญญา MA ที่โปรเจกต์',
  'ma.update': 'แก้ไขสัญญา MA ที่โปรเจกต์',
  'ma.renew': 'ต่ออายุสัญญา MA',
  'ma.delete': 'ลบสัญญา MA — ยังไม่มีผลในระบบ',
  'warranty.view': 'เมนูการรับประกัน',
  'warranty.create': 'ออกประกัน',
  'warranty.update': 'แก้ไขประกัน',
  'warranty.delete': 'ลบประกัน — ยังไม่มีผลในระบบ',
  'document.view': 'ดูเอกสาร',
  'document.create': 'อัปโหลดเอกสาร',
  'document.update': 'แก้ไขเอกสาร',
  'document.delete': 'ลบเอกสาร',
  'report.view': 'เมนูรายงาน',
  'report.export': 'ส่งออกรายงาน',
  'survey.view': 'เมนูแบบประเมิน + แท็บในโปรเจกต์',
  'survey.create': 'สร้างแม่แบบแบบประเมิน',
  'survey.send': 'ส่งแบบและคีย์คำตอบ (ที่โปรเจกต์)',
  'survey.update': 'แก้ไขแบบประเมิน',
  'survey.delete': 'ลบแบบประเมิน',
  'notification.view': 'กระดิ่งแจ้งเตือน (มุมขวาบน)',
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

type UiGroupId =
  | 'queue'
  | 'ticket_ops'
  | 'project'
  | 'customer'
  | 'ops'
  | 'other';

interface UiGroupDef {
  id: UiGroupId;
  label: string;
  codes: string[];
  collapsedByDefault?: boolean;
  unused?: boolean;
}

const UI_GROUPS: UiGroupDef[] = [
  {
    id: 'queue',
    label: 'คิวและการมอบหมายใบ',
    codes: ['ticket.support_queue', 'ticket.assign', 'ticket.view'],
  },
  {
    id: 'ticket_ops',
    label: 'เปิด / แก้ / ปิดใบ',
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
    label: 'โปรเจกต์และงานโปรเจกต์',
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
    label: 'ลูกค้า ติดตาม การติดต่อ',
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
    label: 'MA ประกัน เอกสาร รายงาน แบบประเมิน แจ้งเตือน',
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
      'survey.send',
      'survey.update',
      'notification.view',
      'notification.manage',
      'dashboard.view',
    ],
  },
  {
    id: 'other',
    label: 'อื่น ๆ / ยังไม่ใช้',
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
      'user.view',
      'user.create',
      'user.update',
      'role.view',
      'role.manage',
      'audit_log.view',
    ],
    collapsedByDefault: true,
    unused: true,
  },
];

interface JobPack {
  id: string;
  label: string;
  blurb: string;
  /** เมนูตัวอย่างบนการ์ด */
  menuHint: string[];
  codes: string[];
}

const JOB_PACKS: JobPack[] = [
  {
    id: 'support',
    label: 'ซัพพอร์ตรับเรื่อง',
    blurb: 'รับเรื่องลูกค้า ส่งต่อหัวหน้า',
    menuHint: ['คิวซัพพอร์ต', 'ปัญหา'],
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
    blurb: 'รับใบที่มอบหมายแล้วแก้',
    menuHint: ['ใบของฉัน', 'ปัญหา'],
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
    blurb: 'จัดคิว มอบหมายงาน',
    menuHint: ['คิวแอดมิน', 'ปัญหา'],
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
    blurb: 'ลูกค้า ติดตาม ไม่เข้าคิวใบ',
    menuHint: ['ลูกค้า', 'โปรเจกต์', 'งานติดตาม', 'รายงาน'],
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
      'report.view',
    ],
  },
];

const CUSTOM_PACK_ID = 'custom';

/** ลำดับเมนูสำหรับ chip สรุป (สูงสุด 6) — คำนวณจาก permissions จริง */
const MENU_CHIP_RULES: { label: string; requires: string[] }[] = [
  { label: 'คิวซัพพอร์ต', requires: ['ticket.support_queue'] },
  { label: 'คิวแอดมิน', requires: ['ticket.assign'] },
  { label: 'ใบของฉัน', requires: ['ticket.view'] },
  { label: 'ปัญหา', requires: ['ticket.view'] },
  { label: 'ลูกค้า', requires: ['customer.view'] },
  { label: 'โปรเจกต์', requires: ['project.view'] },
  { label: 'งานโปรเจกต์', requires: ['task.view'] },
  { label: 'งานติดตาม', requires: ['followup.view'] },
  { label: 'รายงาน', requires: ['report.view'] },
  { label: 'สัญญา MA', requires: ['ma.view'] },
  { label: 'การรับประกัน', requires: ['warranty.view'] },
  { label: 'แบบประเมิน', requires: ['survey.view'] },
  { label: 'ผู้ใช้', requires: ['user.view'] },
  { label: 'บทบาท', requires: ['role.view', 'role.manage'] },
];

interface UiPermissionRow {
  item: PermissionItem;
  label: string;
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
    MatIconModule,
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
  /** ชุดงานที่เลือก — รวม custom */
  readonly activePackId = signal<string | null>(null);
  readonly permQuery = signal('');
  /** มีการติ๊กมือหลังเลือกชุดงาน */
  private readonly dirtyManual = signal(false);
  /** ชุดสิทธิ์ตอนเลือก pack ล่าสุด — ใช้เทียบ dirty */
  private packBaseline = new Set<number>();

  readonly jobPacks = JOB_PACKS;
  readonly customPackId = CUSTOM_PACK_ID;
  readonly permSearchControl = this.fb.nonNullable.control('');

  private readonly selected = signal<ReadonlySet<number>>(new Set<number>());
  readonly isCreate = !this.data.role;
  readonly form = this.fb.group({
    name: this.fb.nonNullable.control<string | Role>('', Validators.required),
    description: this.fb.nonNullable.control(''),
    isActive: this.fb.nonNullable.control(true),
  });

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
        rows.push(this.toRow(item, code));
      }
      if (def.id === 'other') {
        for (const [, item] of map) {
          if (used.has(item.code)) {
            continue;
          }
          rows.push(this.toRow(item, item.code));
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

  readonly filteredSections = computed((): UiSection[] => {
    const q = this.permQuery().trim().toLowerCase();
    if (!q) {
      return this.uiSections();
    }
    return this.uiSections()
      .map((section) => ({
        ...section,
        collapsedByDefault: false,
        rows: section.rows.filter(
          (row) =>
            row.label.toLowerCase().includes(q) ||
            row.hint.toLowerCase().includes(q) ||
            row.item.code.toLowerCase().includes(q) ||
            (row.item.description ?? '').toLowerCase().includes(q) ||
            section.label.toLowerCase().includes(q)
        ),
      }))
      .filter((section) => section.rows.length > 0);
  });

  /** chip เมนู 3–6 ตัว จากสิทธิ์ที่ติ๊กจริง */
  readonly menuChips = computed(() => {
    const codes = this.selectedCodes();
    const chips: string[] = [];
    for (const rule of MENU_CHIP_RULES) {
      if (chips.length >= 6) {
        break;
      }
      if (rule.requires.some((r) => codes.has(r)) && !chips.includes(rule.label)) {
        chips.push(rule.label);
      }
    }
    return chips;
  });

  readonly selectedCount = computed(() => this.selected().size);
  readonly isFiltering = computed(() => this.permQuery().trim().length > 0);
  readonly activePack = computed(() => {
    const id = this.activePackId();
    if (!id || id === CUSTOM_PACK_ID) {
      return null;
    }
    return JOB_PACKS.find((p) => p.id === id) ?? null;
  });
  readonly isCustomPack = computed(() => this.activePackId() === CUSTOM_PACK_ID);

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
        if (role) {
          this.matchClosestPack();
        }
      },
      error: (err: Error) => {
        this.error.set(err.message);
        this.loading.set(false);
      },
    });

    this.permSearchControl.valueChanges
      .pipe(debounceTime(150), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((value) => this.permQuery.set(value));

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

  clearPermSearch(): void {
    this.permSearchControl.setValue('');
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
    this.matchClosestPack();
  }

  selectJobPack(pack: JobPack): void {
    if (!this.confirmReplaceIfDirty(pack.label)) {
      return;
    }
    this.applyCodes(pack.codes);
    this.activePackId.set(pack.id);
    this.dirtyManual.set(false);
    this.templateFromName.set(null);

    if (!this.form.controls.description.value.trim()) {
      this.form.patchValue({ description: pack.blurb }, { emitEvent: false });
    }
    if (this.isCreate) {
      const nameCtrl = this.form.controls.name;
      const current =
        typeof nameCtrl.value === 'string' ? nameCtrl.value.trim() : nameCtrl.value?.name ?? '';
      if (!current) {
        nameCtrl.setValue(pack.label, { emitEvent: false });
      }
    }
  }

  selectCustomPack(): void {
    if (!this.confirmReplaceIfDirty('กำหนดเอง')) {
      return;
    }
    this.activePackId.set(CUSTOM_PACK_ID);
    this.dirtyManual.set(false);
    this.packBaseline = new Set(this.selected());
    this.templateFromName.set(null);
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
    this.afterManualEdit();
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
    this.afterManualEdit();
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

  private toRow(item: PermissionItem, code: string): UiPermissionRow {
    return {
      item,
      label: PERMISSION_LABELS[code] || item.description || code,
      hint:
        PERMISSION_HINTS[code] ||
        item.description ||
        (item.superAdminOnly ? 'สงวนให้ Super Admin' : 'ยังไม่มีคำอธิบาย'),
      locked: !!item.superAdminOnly,
    };
  }

  private selectedCodes(): Set<string> {
    return new Set(
      Array.from(this.selected())
        .map((id) => this.findById(id)?.code)
        .filter((c): c is string => !!c)
    );
  }

  private applyCodes(codes: string[]): void {
    const map = this.byCode();
    const next = new Set<number>();
    let missing = 0;
    for (const code of codes) {
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
    this.packBaseline = new Set(next);
    if (missing > 0) {
      this.snack.open(`มี ${missing} สิทธิ์ที่ API ยังไม่มี — ข้ามไป`, 'ปิด', {
        duration: 3500,
      });
    }
  }

  private afterManualEdit(): void {
    this.dirtyManual.set(true);
    const current = this.selected();
    const baseline = this.packBaseline;
    const sameSize = current.size === baseline.size;
    const same =
      sameSize && Array.from(current).every((id) => baseline.has(id));
    if (!same) {
      const closest = this.findClosestPackId(this.selectedCodes());
      this.activePackId.set(closest ?? CUSTOM_PACK_ID);
      if (closest) {
        const pack = JOB_PACKS.find((p) => p.id === closest);
        if (pack) {
          const packIds = this.idsForCodes(pack.codes);
          const exact =
            packIds.size === current.size &&
            Array.from(packIds).every((id) => current.has(id));
          if (!exact) {
            this.activePackId.set(CUSTOM_PACK_ID);
          } else {
            this.dirtyManual.set(false);
            this.packBaseline = new Set(current);
          }
        }
      }
    }
  }

  private confirmReplaceIfDirty(nextLabel: string): boolean {
    if (!this.dirtyManual()) {
      return true;
    }
    return window.confirm(
      `มีการปรับสิทธิ์ด้วยมือไว้แล้ว\nเปลี่ยนเป็น「${nextLabel}」จะแทนที่การติ๊กทั้งหมด ทำต่อหรือไม่?`
    );
  }

  private matchClosestPack(): void {
    const closest = this.findClosestPackId(this.selectedCodes());
    this.activePackId.set(closest ?? CUSTOM_PACK_ID);
    if (closest) {
      const pack = JOB_PACKS.find((p) => p.id === closest)!;
      this.packBaseline = this.idsForCodes(pack.codes);
      const current = this.selected();
      const exact =
        this.packBaseline.size === current.size &&
        Array.from(this.packBaseline).every((id) => current.has(id));
      this.dirtyManual.set(!exact);
      if (!exact) {
        this.activePackId.set(CUSTOM_PACK_ID);
        this.packBaseline = new Set(current);
      }
    } else {
      this.packBaseline = new Set(this.selected());
      this.dirtyManual.set(false);
    }
  }

  /** จับคู่ชุดงานเมื่อชุดสิทธิ์หลักตรง (≥80% ของรหัสใน pack และครอบคลุมรหัสหลัก) */
  private findClosestPackId(codes: Set<string>): string | null {
    if (codes.size === 0) {
      return null;
    }
    let best: { id: string; score: number } | null = null;
    for (const pack of JOB_PACKS) {
      const packCodes = pack.codes.filter((c) => this.byCode().has(c));
      if (!packCodes.length) {
        continue;
      }
      const hit = packCodes.filter((c) => codes.has(c)).length;
      const coverage = hit / packCodes.length;
      const extra = Array.from(codes).filter((c) => !packCodes.includes(c)).length;
      const precision = hit / (hit + extra || 1);
      const score = coverage * 0.7 + precision * 0.3;
      if (coverage < 0.8) {
        continue;
      }
      if (!best || score > best.score) {
        best = { id: pack.id, score };
      }
    }
    return best?.id ?? null;
  }

  private idsForCodes(codes: string[]): Set<number> {
    const map = this.byCode();
    const ids = new Set<number>();
    for (const code of codes) {
      const item = map.get(code);
      if (item && !item.superAdminOnly) {
        ids.add(item.id);
      }
    }
    return ids;
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
    this.packBaseline = new Set(this.selected());
    this.dirtyManual.set(false);
    if (role.description?.trim() && !this.form.controls.description.value.trim()) {
      this.form.patchValue({ description: role.description }, { emitEvent: false });
    }
    this.templateFromName.set(role.name);
  }
}
