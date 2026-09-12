import { Component, OnInit, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  ACCOUNT_TYPE_LABELS,
  AccountType,
  USER_STATUS_LABELS,
} from '../../core/models/user.model';
import { AuthService } from '../../core/services/auth.service';

const MODULE_LABELS: Record<string, string> = {
  dashboard: 'หน้าแรก',
  user: 'ผู้ใช้งาน',
  role: 'บทบาทและสิทธิ์',
  permission: 'สิทธิ์',
  customer: 'ลูกค้า',
  contact: 'ผู้ติดต่อ',
  communication: 'ประวัติการติดต่อ',
  communication_log: 'ประวัติการติดต่อ',
  project: 'โปรเจค',
  task: 'งานย่อย',
  delivery: 'การส่งมอบ',
  ticket: 'ปัญหา / ซัพพอร์ต',
  warranty: 'การรับประกัน',
  ma: 'สัญญาบำรุงรักษา',
  follow_up: 'ติดตามลูกค้า',
  survey: 'แบบประเมิน',
  document: 'เอกสาร',
  file: 'ไฟล์',
  report: 'รายงาน',
  notification: 'การแจ้งเตือน',
  audit: 'บันทึกการใช้งาน',
  audit_log: 'บันทึกการใช้งาน',
};

const ACTION_LABELS: Record<string, string> = {
  view: 'ดู',
  create: 'สร้าง',
  edit: 'แก้ไข',
  update: 'แก้ไข',
  delete: 'ลบ',
  resolve: 'ปิดงาน',
  assign: 'มอบหมาย',
  manage: 'จัดการ',
  renew: 'ต่ออายุ',
  export: 'ส่งออก',
  import: 'นำเข้า',
  answer: 'ตอบ',
  publish: 'เผยแพร่',
  accept: 'ตรวจรับ',
  reject: 'ปฏิเสธ',
};

const ACTION_ORDER = [
  'view',
  'create',
  'edit',
  'update',
  'delete',
  'resolve',
  'assign',
  'accept',
  'reject',
  'manage',
  'renew',
  'export',
  'import',
  'answer',
  'publish',
];

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './profile-page.component.html',
  styleUrl: './profile-page.component.scss',
})
export class ProfilePageComponent implements OnInit {
  private readonly auth = inject(AuthService);

  readonly user = this.auth.currentUser;
  readonly statusLabels = USER_STATUS_LABELS;

  readonly permissionGroups = computed(() => {
    const codes = this.auth.session()?.permissions ?? [];
    const map = new Map<string, string[]>();
    for (const code of codes) {
      const [module, action = ''] = code.split('.');
      const list = map.get(module) ?? [];
      if (action && !list.includes(action)) {
        list.push(action);
      }
      map.set(module, list);
    }
    return Array.from(map.entries())
      .map(([module, actions]) => {
        const sorted = [...actions].sort((a, b) => {
          const ia = ACTION_ORDER.indexOf(a);
          const ib = ACTION_ORDER.indexOf(b);
          return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        });
        return {
          module,
          label: MODULE_LABELS[module] ?? module,
          actions: sorted.map((a) => ACTION_LABELS[a] ?? a),
          count: sorted.length,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, 'th'));
  });

  readonly permissionCount = computed(() => this.auth.session()?.permissions.length ?? 0);
  readonly moduleCount = computed(() => this.permissionGroups().length);

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.auth.refreshSession();
  }

  accountTypeLabel(type: AccountType | undefined): string {
    return type ? ACCOUNT_TYPE_LABELS[type] : '—';
  }

  isSystemAccount(type: AccountType | undefined): boolean {
    return type === 'ADMIN' || type === 'SUPER_ADMIN';
  }
}
