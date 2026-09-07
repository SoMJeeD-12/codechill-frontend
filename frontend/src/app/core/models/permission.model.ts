/** รหัสเมนู/โมดูล ตามเอกสารออกแบบ M0–M12 */
export type MenuCode =
  | 'dashboard'
  | 'users'
  | 'roles'
  | 'customers'
  | 'projects'
  | 'tickets'
  | 'warranties'
  | 'ma'
  | 'follow-ups'
  | 'surveys'
  | 'documents'
  | 'reports'
  | 'notifications'
  | 'audit-logs';

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete';

export interface Permission {
  menuCode: MenuCode;
  actions: PermissionAction[];
}

export interface Role {
  id: number;
  name: string;
  description: string;
  permissions: Permission[];
}

export interface MenuItem {
  code: MenuCode;
  label: string;
  icon: string;
  route: string;
  /** กลุ่มใน sidebar */
  group: 'main' | 'ops' | 'revenue' | 'system';
}
