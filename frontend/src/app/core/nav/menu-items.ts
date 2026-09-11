import { MenuItem } from '../models/permission.model';

/**
 * เมนู sidebar — 3 ชั้นตามประชุมพี่เลี้ยง 11 ก.ย.
 * งานหลัก / ข้อมูลรอง / ตั้งค่า — กั้นด้วย permissions จาก /auth/me
 */
export const MENU_ITEMS: MenuItem[] = [
  // —— งานหลัก ——
  { code: 'dashboard', label: 'ภาพรวม', icon: 'dashboard', route: '/app/dashboard', group: 'main' },
  { code: 'projects', label: 'โปรเจค', icon: 'folder_special', route: '/app/projects', group: 'main' },
  { code: 'tasks', label: 'งาน', icon: 'view_kanban', route: '/app/tasks', group: 'main' },
  { code: 'tickets', label: 'ปัญหา / ซัพพอร์ต', icon: 'support_agent', route: '/app/tickets', group: 'main' },
  { code: 'follow-ups', label: 'ติดตาม', icon: 'event_available', route: '/app/follow-ups', group: 'main' },
  { code: 'my-work', label: 'งานของฉัน', icon: 'assignment_ind', route: '/app/my-work', group: 'main' },

  // —— ข้อมูลรอง ——
  { code: 'customers', label: 'ลูกค้า', icon: 'business', route: '/app/customers', group: 'support' },
  {
    code: 'customer-360',
    label: 'มุมมองลูกค้า 360°',
    icon: 'travel_explore',
    route: '/app/customer-360',
    group: 'support',
  },
  { code: 'warranties', label: 'การรับประกัน', icon: 'verified_user', route: '/app/warranties', group: 'support' },
  { code: 'ma', label: 'สัญญา MA', icon: 'handshake', route: '/app/ma', group: 'support' },
  { code: 'surveys', label: 'แบบประเมิน', icon: 'rate_review', route: '/app/surveys', group: 'support' },
  { code: 'reports', label: 'รายงาน', icon: 'analytics', route: '/app/reports', group: 'support' },

  // —— ตั้งค่า ——
  { code: 'users', label: 'ผู้ใช้งาน', icon: 'group', route: '/app/users', group: 'settings' },
  { code: 'roles', label: 'บทบาทและสิทธิ์', icon: 'admin_panel_settings', route: '/app/roles', group: 'settings' },
  { code: 'ma-plans', label: 'แผน MA', icon: 'playlist_add_check', route: '/app/ma/plans', group: 'settings' },
  { code: 'notifications', label: 'การแจ้งเตือน', icon: 'notifications', route: '/app/notifications', group: 'settings' },
  { code: 'audit-logs', label: 'บันทึกการใช้งาน', icon: 'history', route: '/app/audit-logs', group: 'settings' },
];
