import { MenuCode, MenuItem } from '../models/permission.model';

/**
 * เมนู sidebar 3 ชั้น (ตามพี่เลี้ยง — โปรเจกต์เป็นพระเอก)
 *   งานหลัก  = ของทำทุกวัน · โปรเจกต์อยู่ชั้นนี้
 *   ข้อมูล    = ซัพพอร์ตงานหลัก (ลูกค้า · ประกัน · MA ฯลฯ) — ห้ามมีโปรเจกต์ซ้ำ
 *   ตั้งค่า    = นาน ๆ ใช้ที
 *
 * แยกให้ชัด:
 *   งานโปรเจกต์ / ตรวจงาน = งานย่อยในโปรเจกต์
 *   คิวซัพพอร์ต / คิวแอดมิน / ใบของฉัน / ปัญหา = ใบแจ้งปัญหาจากลูกค้า
 *
 * กั้นด้วย permissions จาก /api/auth/me เท่านั้น (ห้ามใช้ roles / ตำแหน่ง)
 * การแจ้งเตือน = ไอคอนกระดิ่งบน header (ไม่ใส่ซ้ายซ้ำ)
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

export type MainMenuGroupKey = 'tasks' | 'tickets';

/** โครงเมนูงานหลัก — เมนูเดี่ยว หรือกลุ่มพับได้ (ยังไม่กรองสิทธิ์) */
export type MainMenuNode =
  | { kind: 'item'; code: MenuCode }
  | {
      kind: 'group';
      key: MainMenuGroupKey;
      label: string;
      icon: string;
      codes: MenuCode[];
      defaultExpanded: boolean;
      /** ป้ายเมนูเมื่ออยู่ในกลุ่ม */
      childLabels?: Partial<Record<MenuCode, string>>;
    };

const TICKET_MENU_CODES: MenuCode[] = [
  'ticket-admin-queue',
  'ticket-workflow',
  'tickets-mine',
  'tickets',
];

/**
 * โครงเมนูงานหลักตามสิทธิ์คิว (permissions จาก /auth/me)
 * ปักคิวประจำไว้ชั้นบน: ticket.assign → คิวแอดมิน · ticket.support_queue → คิวซัพพอร์ต · ไม่มีทั้งคู่ → ใบของฉัน
 * ใบปัญหาที่เหลืออยู่ในกลุ่ม「ใบปัญหา」
 */
export function mainMenuOrder(opts: {
  hasAdminQueue: boolean;
  hasSupportQueue: boolean;
}): MainMenuNode[] {
  const pinned: MenuCode = opts.hasAdminQueue
    ? 'ticket-admin-queue'
    : opts.hasSupportQueue
      ? 'ticket-workflow'
      : 'tickets-mine';
  return [
    { kind: 'item', code: 'dashboard' },
    { kind: 'item', code: 'my-dashboard' },
    { kind: 'item', code: pinned },
    { kind: 'item', code: 'projects' },
    {
      kind: 'group',
      key: 'tasks',
      label: 'งาน',
      icon: 'task_alt',
      codes: ['tasks-me', 'tasks-review', 'tasks'],
      defaultExpanded: true,
    },
    {
      kind: 'group',
      key: 'tickets',
      label: 'ใบปัญหา',
      icon: 'confirmation_number',
      codes: TICKET_MENU_CODES.filter((c) => c !== pinned),
      defaultExpanded: false,
      childLabels: { tickets: 'ปัญหาทั้งหมด' },
    },
    { kind: 'item', code: 'follow-ups' },
  ];
}

export const MENU_ITEMS: MenuItem[] = [
  // —— งานหลัก ——
  {
    code: 'dashboard',
    label: 'หน้าแรก',
    description: 'ดูสรุปงานวันนี้',
    icon: 'home',
    route: '/app/home',
    group: 'main',
  },
  {
    code: 'my-dashboard',
    label: 'แดชบอร์ดของฉัน',
    description: 'สรุปงานที่ฉันทำในแต่ละช่วง — เห็นเฉพาะตัวเอง',
    icon: 'insights',
    route: '/app/dashboard',
    group: 'main',
  },
  {
    code: 'projects',
    label: 'โปรเจกต์',
    description: 'ดูและจัดการโปรเจกต์ลูกค้า',
    icon: 'folder_special',
    route: '/app/projects',
    group: 'main',
  },
  {
    code: 'tasks-me',
    label: 'งานโปรเจกต์',
    description: 'งานในโปรเจกต์ที่ได้รับมอบหมาย',
    icon: 'checklist',
    route: '/app/tasks/me',
    group: 'main',
  },
  {
    code: 'tasks-review',
    label: 'งานตรวจ',
    description: 'งานที่รอตรวจ และประวัติที่ฉันตรวจ',
    icon: 'rate_review',
    route: '/app/tasks/review',
    group: 'main',
  },
  {
    code: 'tasks',
    label: 'กระดานงาน',
    description: 'ภาพรวมงานโปรเจกต์ทุกสถานะแบบกระดาน',
    icon: 'view_kanban',
    route: '/app/tasks/board',
    group: 'main',
  },
  {
    code: 'ticket-workflow',
    label: 'คิวซัพพอร์ต',
    description: 'ใบปัญหาที่ต้องส่งหัวหน้า หรือรอบอกลูกค้า',
    icon: 'support_agent',
    route: '/app/tickets/support-queue',
    group: 'main',
  },
  {
    code: 'ticket-admin-queue',
    label: 'คิวแอดมิน',
    description: 'ใบปัญหาที่ต้องรับคิว จัดคนทำ หรือตรวจงานแก้',
    icon: 'assignment_ind',
    route: '/app/tickets/admin-queue',
    group: 'main',
  },
  {
    code: 'tickets-mine',
    label: 'ใบของฉัน',
    description: 'ใบปัญหาที่ฉันต้องเป็นคนแก้',
    icon: 'person',
    route: '/app/tickets/mine',
    group: 'main',
  },
  {
    code: 'tickets',
    label: 'ปัญหา',
    description: 'ค้นหา/ดูใบปัญหาทั้งหมด',
    icon: 'inventory_2',
    route: '/app/tickets',
    group: 'main',
  },
  {
    code: 'follow-ups',
    label: 'งานติดตาม',
    description: 'เตือนให้ตามลูกค้าตามนัด',
    icon: 'event_available',
    route: '/app/follow-ups',
    group: 'main',
  },

  // —— ข้อมูล (ไม่มีโปรเจกต์) ——
  {
    code: 'customers',
    label: 'ลูกค้า',
    description: 'รายชื่อและข้อมูลลูกค้า',
    icon: 'business',
    route: '/app/customers',
    group: 'support',
  },
  {
    code: 'customer-360',
    label: 'มุมมอง 360°',
    description: 'ดูภาพรวมลูกค้ารายเดียวจบ',
    icon: 'travel_explore',
    route: '/app/customer-360',
    group: 'support',
  },
  {
    code: 'warranties',
    label: 'การรับประกัน',
    description: 'ดูประกันหลังส่งมอบ',
    icon: 'verified_user',
    route: '/app/warranties',
    group: 'support',
  },
  {
    code: 'ma',
    label: 'สัญญา MA',
    description: 'สัญญาบำรุงรักษาทั้งระบบ',
    icon: 'handshake',
    route: '/app/ma',
    group: 'support',
  },
  {
    code: 'ma-plans',
    label: 'แผน MA',
    description: 'แพ็กเกจดูแลรักษาระบบ',
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
    description: 'ดูสรุปตัวเลขตามสัญญา',
    icon: 'analytics',
    route: '/app/reports',
    group: 'support',
  },

  // —— ตั้งค่า ——
  {
    code: 'users',
    label: 'ผู้ใช้',
    description: 'จัดการบัญชีพนักงาน',
    icon: 'group',
    route: '/app/users',
    group: 'settings',
  },
  {
    code: 'roles',
    label: 'บทบาท',
    description: 'กำหนดว่าแต่ละบทบาททำอะไรได้',
    icon: 'admin_panel_settings',
    route: '/app/roles',
    group: 'settings',
  },
  {
    code: 'audit-logs',
    label: 'ประวัติการใช้งาน',
    description: 'ดูว่าใครทำอะไรในระบบ',
    icon: 'history',
    route: '/app/audit-logs',
    group: 'settings',
  },
];
