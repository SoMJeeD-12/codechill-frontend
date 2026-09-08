import { MenuCode, PermissionAction } from '../models/permission.model';

/**
 * แปลงรหัสเมนูฝั่ง UI → module ใน permission code ของ API
 * เช่น customers → customer.view
 */
export const MENU_PERMISSION_MODULE: Record<MenuCode, string> = {
  dashboard: 'dashboard',
  customers: 'customer',
  projects: 'project',
  tickets: 'ticket',
  warranties: 'warranty',
  ma: 'ma',
  'follow-ups': 'follow_up',
  surveys: 'survey',
  documents: 'document',
  reports: 'report',
  notifications: 'notification',
  users: 'user',
  roles: 'role',
  'audit-logs': 'audit_log',
};

export function permissionCode(
  menuCode: MenuCode,
  action: PermissionAction | string = 'view'
): string {
  return `${MENU_PERMISSION_MODULE[menuCode]}.${action}`;
}
