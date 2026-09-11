import { MenuCode, PermissionAction } from '../models/permission.model';

/**
 * แปลงรหัสเมนูฝั่ง UI → module ใน permission code ของ API
 * เช่น customers → customer.view
 */
export const MENU_PERMISSION_MODULE: Record<MenuCode, string> = {
  dashboard: 'dashboard',
  'my-work': 'my_work',
  customers: 'customer',
  projects: 'project',
  tickets: 'ticket',
  warranties: 'warranty',
  ma: 'ma',
  'follow-ups': 'followup',
  surveys: 'survey',
  documents: 'document',
  reports: 'report',
  notifications: 'notification',
  users: 'user',
  roles: 'role',
  'audit-logs': 'audit_log',
};

/** ชื่อโมดูลที่ API อาจใช้สลับกันได้ */
const MODULE_ALIASES: Record<string, string[]> = {
  audit_log: ['audit_log', 'audit'],
  communication_log: ['communication_log', 'communication'],
  followup: ['followup', 'follow_up'],
};

export function permissionCode(
  menuCode: MenuCode,
  action: PermissionAction | string = 'view'
): string {
  return `${MENU_PERMISSION_MODULE[menuCode]}.${action}`;
}

/** API ใช้ทั้ง edit และ update สำหรับการแก้ไข */
export function actionAliases(action: string): string[] {
  const a = action.toLowerCase();
  if (a === 'edit' || a === 'update') {
    return ['edit', 'update'];
  }
  return [a];
}

export function moduleAliases(module: string): string[] {
  return MODULE_ALIASES[module] ?? [module];
}

/** รหัสสิทธิ์ที่เป็นไปได้ทั้งหมดสำหรับเมนู + action */
export function permissionCandidates(
  menuCode: MenuCode,
  action: PermissionAction | string = 'view'
): string[] {
  const modules = moduleAliases(MENU_PERMISSION_MODULE[menuCode]);
  const actions = actionAliases(action);
  const codes: string[] = [];
  for (const m of modules) {
    for (const a of actions) {
      codes.push(`${m}.${a}`);
    }
  }
  return codes;
}

/** มีสิทธิ์ของโมดูลนี้ใดๆ หรือไม่ (ใช้เปิดเมนูเมื่อมีแค่ create/update) */
export function hasAnyModulePermission(permissions: string[], menuCode: MenuCode): boolean {
  const modules = moduleAliases(MENU_PERMISSION_MODULE[menuCode]);
  return permissions.some((p) => modules.some((m) => p === m || p.startsWith(`${m}.`)));
}
