import { MenuItem } from '../models/permission.model';

/** รายการเมนู sidebar — ใช้คู่กับ permission codes จาก API */
export const MENU_ITEMS: MenuItem[] = [
  { code: 'dashboard', label: 'ภาพรวม', icon: 'dashboard', route: '/app/dashboard', group: 'main' },
  { code: 'my-work', label: 'งานของฉัน', icon: 'assignment_ind', route: '/app/my-work', group: 'main' },
  { code: 'customers', label: 'ลูกค้า', icon: 'business', route: '/app/customers', group: 'main' },
  { code: 'projects', label: 'โครงการ', icon: 'folder_special', route: '/app/projects', group: 'ops' },
  { code: 'tickets', label: 'ปัญหา / ซัพพอร์ต', icon: 'support_agent', route: '/app/tickets', group: 'ops' },
  { code: 'warranties', label: 'การรับประกัน', icon: 'verified_user', route: '/app/warranties', group: 'revenue' },
  { code: 'ma', label: 'สัญญาบำรุงรักษา', icon: 'handshake', route: '/app/ma', group: 'revenue' },
  { code: 'follow-ups', label: 'ติดตามลูกค้า', icon: 'event_available', route: '/app/follow-ups', group: 'ops' },
  { code: 'surveys', label: 'แบบประเมิน', icon: 'rate_review', route: '/app/surveys', group: 'ops' },
  { code: 'documents', label: 'เอกสาร', icon: 'description', route: '/app/documents', group: 'ops' },
  { code: 'reports', label: 'รายงาน', icon: 'analytics', route: '/app/reports', group: 'main' },
  { code: 'notifications', label: 'การแจ้งเตือน', icon: 'notifications', route: '/app/notifications', group: 'system' },
  { code: 'users', label: 'ผู้ใช้งาน', icon: 'group', route: '/app/users', group: 'system' },
  { code: 'roles', label: 'บทบาทและสิทธิ์', icon: 'admin_panel_settings', route: '/app/roles', group: 'system' },
  { code: 'audit-logs', label: 'บันทึกการใช้งาน', icon: 'history', route: '/app/audit-logs', group: 'system' },
];
