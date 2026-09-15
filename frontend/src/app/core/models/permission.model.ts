/** รหัสเมนู/โมดูล ตามเอกสารออกแบบ M0–M12 */
export type MenuCode =
  | 'dashboard'
  | 'tasks'
  | 'tasks-me'
  | 'tasks-unassigned'
  | 'tasks-doing'
  | 'tasks-review'
  | 'tasks-overdue'
  | 'users'
  | 'roles'
  | 'customers'
  | 'customer-360'
  | 'projects'
  | 'tickets'
  | 'warranties'
  | 'ma'
  | 'ma-plans'
  | 'follow-ups'
  | 'surveys'
  | 'documents'
  | 'reports'
  | 'audit-logs';

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete';

/** PermissionItemDto — สิทธิ์รายรายการจาก GET /permissions */
export interface PermissionItem {
  id: number;
  code: string;
  module: string;
  action: string;
  description: string | null;
  superAdminOnly: boolean;
}

/** PermissionGroupDto — GET /permissions คืนเป็นกลุ่มตาม module */
export interface PermissionGroup {
  module: string;
  permissions: PermissionItem[];
}

/** RoleDetailDto */
export interface Role {
  id: number;
  name: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  userCount: number;
  permissions: PermissionItem[];
  createdAt: string;
  updatedAt: string;
}

export interface MenuItem {
  code: MenuCode;
  label: string;
  /** คำอธิบายสั้นใต้ชื่อเมนู */
  description?: string;
  icon: string;
  route: string;
  /** กลุ่มใน sidebar — งานหลัก / ข้อมูล / ตั้งค่า */
  group: 'main' | 'support' | 'settings';
}
