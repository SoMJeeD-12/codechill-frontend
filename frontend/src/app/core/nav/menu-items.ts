import { MenuItem } from '../models/permission.model';

/**
 * เมนู sidebar 3 ชั้น
 *   งานหลัก  = งานที่ทำทุกวัน
 *   ข้อมูล    = ข้อมูลที่ช่วยงานนั้น
 *   ตั้งค่า    = นาน ๆ ใช้ที
 *
 * กั้นด้วย permissions จาก /api/auth/me เท่านั้น (ห้ามใช้ roles)
 *
 * หมายเหตุ:
 * - "งานของฉัน" ไม่แยกเมนูแล้ว — รวมอยู่ในหน้าแรก
 * - "การแจ้งเตือน" ถอดออก เพราะ backend ยังไม่มี endpoint (ดู docs/be-requests.md ข้อ 9)
 */
export const MENU_ITEMS: MenuItem[] = [
  // —— งานหลัก ——
  { code: 'dashboard', label: 'หน้าแรก', icon: 'home', route: '/app/home', group: 'main' },
  { code: 'projects', label: 'โปรเจค', icon: 'folder_special', route: '/app/projects', group: 'main' },
  { code: 'tasks', label: 'งาน (กระดาน)', icon: 'view_kanban', route: '/app/tasks', group: 'main' },
  { code: 'tickets', label: 'ปัญหา / ซัพพอร์ต', icon: 'support_agent', route: '/app/tickets', group: 'main' },
  { code: 'follow-ups', label: 'ติดตามลูกค้า', icon: 'event_available', route: '/app/follow-ups', group: 'main' },

  // —— ข้อมูล ——
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
  { code: 'users', label: 'ผู้ใช้', icon: 'group', route: '/app/users', group: 'settings' },
  { code: 'roles', label: 'บทบาท', icon: 'admin_panel_settings', route: '/app/roles', group: 'settings' },
  { code: 'ma-plans', label: 'แผน MA', icon: 'playlist_add_check', route: '/app/ma/plans', group: 'settings' },
  { code: 'audit-logs', label: 'ประวัติการใช้งาน', icon: 'history', route: '/app/audit-logs', group: 'settings' },
];
