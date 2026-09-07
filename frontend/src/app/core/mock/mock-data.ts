import { MenuItem, Permission, Role } from '../models/permission.model';
import { User } from '../models/user.model';

/** รหัสผ่าน mock ทุกบัญชี: password */
export const MOCK_PASSWORD = 'password';

export const MOCK_ROLES: Role[] = [
  {
    id: 1,
    name: 'ซัพพอร์ต',
    description: 'รับเรื่องและแก้ปัญหาลูกค้า',
    permissions: [
      { menuCode: 'dashboard', actions: ['view'] },
      { menuCode: 'customers', actions: ['view', 'create', 'edit'] },
      { menuCode: 'tickets', actions: ['view', 'create', 'edit'] },
      { menuCode: 'projects', actions: ['view'] },
      { menuCode: 'documents', actions: ['view'] },
    ],
  },
  {
    id: 2,
    name: 'การตลาด',
    description: 'ติดตามลูกค้าและโอกาสขาย',
    permissions: [
      { menuCode: 'dashboard', actions: ['view'] },
      { menuCode: 'customers', actions: ['view', 'create', 'edit'] },
      { menuCode: 'follow-ups', actions: ['view', 'create', 'edit'] },
      { menuCode: 'surveys', actions: ['view', 'create'] },
      { menuCode: 'reports', actions: ['view'] },
    ],
  },
  {
    id: 3,
    name: 'หัวหน้าโครงการ',
    description: 'ดูแลโครงการ งานย่อย และการส่งมอบ',
    permissions: [
      { menuCode: 'dashboard', actions: ['view'] },
      { menuCode: 'customers', actions: ['view'] },
      { menuCode: 'projects', actions: ['view', 'create', 'edit', 'delete'] },
      { menuCode: 'warranties', actions: ['view', 'create', 'edit'] },
      { menuCode: 'ma', actions: ['view'] },
      { menuCode: 'documents', actions: ['view', 'create', 'edit'] },
      { menuCode: 'tickets', actions: ['view'] },
    ],
  },
];

export const MOCK_USERS: User[] = [
  {
    id: 1,
    username: 'superadmin',
    email: 'super@company.local',
    fullName: 'สมชาย ผู้ดูแลสูงสุด',
    accountType: 'SUPER_ADMIN',
    status: 'ACTIVE',
    roleIds: [],
    lastLoginAt: null,
  },
  {
    id: 2,
    username: 'admin',
    email: 'admin@company.local',
    fullName: 'สมหญิง ผู้ดูแลระบบ',
    accountType: 'ADMIN',
    status: 'ACTIVE',
    roleIds: [3],
    lastLoginAt: null,
  },
  {
    id: 3,
    username: 'support',
    email: 'support@company.local',
    fullName: 'วิชัย ซัพพอร์ต',
    accountType: 'USER',
    status: 'ACTIVE',
    roleIds: [1],
    lastLoginAt: null,
  },
  {
    id: 4,
    username: 'multi',
    email: 'multi@company.local',
    fullName: 'นภา ดูแลหลายด้าน',
    accountType: 'USER',
    status: 'ACTIVE',
    roleIds: [1, 2],
    lastLoginAt: null,
  },
];

/** Super Admin / Admin เห็นเมนูครบ — User ใช้สิทธิ์จากบทบาท */
export const ALL_PERMISSIONS: Permission[] = [
  { menuCode: 'dashboard', actions: ['view', 'create', 'edit', 'delete'] },
  { menuCode: 'users', actions: ['view', 'create', 'edit', 'delete'] },
  { menuCode: 'roles', actions: ['view', 'create', 'edit', 'delete'] },
  { menuCode: 'customers', actions: ['view', 'create', 'edit', 'delete'] },
  { menuCode: 'projects', actions: ['view', 'create', 'edit', 'delete'] },
  { menuCode: 'tickets', actions: ['view', 'create', 'edit', 'delete'] },
  { menuCode: 'warranties', actions: ['view', 'create', 'edit', 'delete'] },
  { menuCode: 'ma', actions: ['view', 'create', 'edit', 'delete'] },
  { menuCode: 'follow-ups', actions: ['view', 'create', 'edit', 'delete'] },
  { menuCode: 'surveys', actions: ['view', 'create', 'edit', 'delete'] },
  { menuCode: 'documents', actions: ['view', 'create', 'edit', 'delete'] },
  { menuCode: 'reports', actions: ['view', 'create', 'edit', 'delete'] },
  { menuCode: 'notifications', actions: ['view', 'create', 'edit', 'delete'] },
  { menuCode: 'audit-logs', actions: ['view'] },
];

export const MENU_ITEMS: MenuItem[] = [
  { code: 'dashboard', label: 'ภาพรวม', icon: 'dashboard', route: '/app/dashboard', group: 'main' },
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
