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
 * - "การแจ้งเตือน" ถอดออก เพราะ backend ยังไม่มี endpoint (ดู docs/be-requests.md)
 */
export const MENU_ITEMS: MenuItem[] = [
  // —— งานหลัก ——
  {
    code: 'dashboard',
    label: 'หน้าแรก',
    description: 'งานที่ต้องทำวันนี้',
    icon: 'home',
    route: '/app/home',
    group: 'main',
  },
  {
    code: 'projects',
    label: 'โปรเจค',
    description: 'รายการและรายละเอียดโปรเจค',
    icon: 'folder_special',
    route: '/app/projects',
    group: 'main',
  },
  {
    code: 'tasks',
    label: 'กระดานงานย่อย',
    description: 'งานย่อยของโปรเจคแบบกระดาน',
    icon: 'view_kanban',
    route: '/app/tasks',
    group: 'main',
  },
  {
    code: 'tickets',
    label: 'ปัญหา / ซัพพอร์ต',
    description: 'ใบแจ้งปัญหาหลังส่งมอบ',
    icon: 'support_agent',
    route: '/app/tickets',
    group: 'main',
  },
  {
    code: 'follow-ups',
    label: 'ติดตามลูกค้า',
    description: 'นัดติดตามและงานค้าง',
    icon: 'event_available',
    route: '/app/follow-ups',
    group: 'main',
  },

  // —— ข้อมูล ——
  {
    code: 'customers',
    label: 'ลูกค้า',
    description: 'ทะเบียนลูกค้า และมุมมอง 360° สรุปทุกอย่างของรายเดียว',
    icon: 'business',
    route: '/app/customers',
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
    code: 'ma',
    label: 'สัญญา MA',
    description: 'สัญญาบำรุงรักษาและโควตา',
    icon: 'handshake',
    route: '/app/ma',
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
    code: 'ma-plans',
    label: 'แผน MA',
    description: 'แพ็กเกจโควตาและราคา',
    icon: 'playlist_add_check',
    route: '/app/ma/plans',
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
