import { MenuItem } from '../models/permission.model';

/**
 * เมนู sidebar 3 ชั้น (ตามพี่เลี้ยง — โปรเจคเป็นพระเอก)
 *   งานหลัก  = ของทำทุกวัน · โปรเจคอยู่ชั้นนี้
 *   ข้อมูล    = ซัพพอร์ตงานหลัก (ลูกค้า · ประกัน · MA ฯลฯ) — ห้ามมีโปรเจกต์ซ้ำ
 *   ตั้งค่า    = นาน ๆ ใช้ที
 *
 * กั้นด้วย permissions จาก /api/auth/me เท่านั้น (ห้ามใช้ roles / ตำแหน่ง)
 * คิวซัพพอร์ต = ticket.support_queue · คิวแอดมิน = ticket.assign
 * งานของฉัน = ใบที่ assigned ให้ฉัน (ticket.view) — ไม่ใช่งานย่อยโปรเจค
 * งานโปรเจค / ตรวจงานโปรเจค = งานย่อย · อยู่ชั้นงานหลักถัดจากโปรเจกต์ (ทางเลือก A)
 */

/** แบนเมนูรวม children — ใช้ตอนเช็คสิทธิ์ / รหัสเมนู */
export function flattenMenuItems(items: MenuItem[]): MenuItem[] {
  const out: MenuItem[] = [];
  for (const item of items) {
    out.push(item);
    if (item.children?.length) {
      out.push(...flattenMenuItems(item.children));
    }
  }
  return out;
}

export const MENU_ITEMS: MenuItem[] = [
  // —— งานหลัก ——
  {
    code: 'dashboard',
    label: 'หน้าแรก',
    description: 'สรุปงานวันนี้',
    icon: 'home',
    route: '/app/home',
    group: 'main',
  },
  {
    code: 'projects',
    label: 'โปรเจกต์',
    description: 'รายการและรายละเอียดโปรเจกต์',
    icon: 'folder_special',
    route: '/app/projects',
    group: 'main',
  },
  {
    code: 'tasks-me',
    label: 'งานโปรเจค',
    description: 'งานย่อยในโปรเจกต์ที่มอบหมายให้คุณ',
    icon: 'checklist',
    route: '/app/tasks/me',
    group: 'main',
  },
  {
    code: 'tasks-review',
    label: 'ตรวจงานโปรเจค',
    description: 'งานย่อยสถานะ REVIEW — ผู้ตรวจอนุมัติ',
    icon: 'rate_review',
    route: '/app/tasks/review',
    group: 'main',
  },
  {
    code: 'ticket-workflow',
    label: 'คิวซัพพอร์ต',
    description: 'รอส่งหัวหน้า · แอดมินส่งกลับมา',
    icon: 'support_agent',
    route: '/app/tickets/support-queue',
    group: 'main',
  },
  {
    code: 'ticket-admin-queue',
    label: 'คิวแอดมิน',
    description: 'รับเรื่อง · มอบหมาย · ส่งตรวจ',
    icon: 'assignment_ind',
    route: '/app/tickets/admin-queue',
    group: 'main',
  },
  {
    code: 'tickets-mine',
    label: 'งานของฉัน',
    description: 'ใบที่มอบหมายให้คุณแก้',
    icon: 'person',
    route: '/app/tickets/mine',
    group: 'main',
  },
  {
    code: 'tickets',
    label: 'ปัญหา',
    description: 'ค้นหา · เปิดใบ · ดูย้อนหลัง',
    icon: 'inventory_2',
    route: '/app/tickets',
    group: 'main',
  },
  {
    code: 'follow-ups',
    label: 'ติดตามโปรเจค',
    description: 'นัดติดตามและงานค้าง',
    icon: 'event_available',
    route: '/app/follow-ups',
    group: 'main',
  },
  {
    code: 'notifications',
    label: 'การแจ้งเตือน',
    description: 'Inbox การแจ้งเตือนของพนักงานในระบบ',
    icon: 'notifications',
    route: '/app/notifications',
    group: 'main',
  },

  // —— ข้อมูล (ไม่มีโปรเจกต์) ——
  {
    code: 'customers',
    label: 'ลูกค้า',
    description: 'ทะเบียนลูกค้า — ชื่อ ภาษี ที่อยู่ ผู้ติดต่อ',
    icon: 'business',
    route: '/app/customers',
    group: 'support',
  },
  {
    code: 'customer-360',
    label: 'มุมมอง 360°',
    description: 'เลือกลูกค้า 1 ราย แล้วดูโปรเจกต์ ประกัน MA ปัญหา ติดตาม ในหน้าเดียว',
    icon: 'travel_explore',
    route: '/app/customer-360',
    group: 'support',
  },
  {
    code: 'warranties',
    label: 'การรับประกัน',
    description: 'ประกันหลังส่งมอบ',
    icon: 'verified_user',
    route: '/app/warranties',
    group: 'support',
  },
  {
    code: 'ma-plans',
    label: 'แผน MA',
    description: 'แม่แบบแพ็กเกจโควตา — สัญญาจริงสร้างที่โปรเจกต์',
    icon: 'playlist_add_check',
    route: '/app/ma/plans',
    group: 'support',
  },
  {
    code: 'surveys',
    label: 'แบบประเมิน',
    description: 'แบบสอบถามความพึงพอใจ',
    icon: 'rate_review',
    route: '/app/surveys',
    group: 'support',
  },
  {
    code: 'reports',
    label: 'รายงาน',
    description: 'สรุปตัวเลขระดับบริษัท',
    icon: 'analytics',
    route: '/app/reports',
    group: 'support',
  },

  // —— ตั้งค่า ——
  {
    code: 'users',
    label: 'ผู้ใช้',
    description: 'บัญชีเข้าใช้งานระบบ',
    icon: 'group',
    route: '/app/users',
    group: 'settings',
  },
  {
    code: 'roles',
    label: 'บทบาท',
    description: 'กำหนดสิทธิ์ตามหน้าที่',
    icon: 'admin_panel_settings',
    route: '/app/roles',
    group: 'settings',
  },
  {
    code: 'audit-logs',
    label: 'ประวัติการใช้งาน',
    description: 'ใครทำอะไรเมื่อไหร่',
    icon: 'history',
    route: '/app/audit-logs',
    group: 'settings',
  },
];
