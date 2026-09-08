export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'BULK_CREATE'
  | 'BULK_UPDATE'
  | 'BULK_DELETE';

/** AuditActorDto */
export interface AuditActor {
  id: number;
  username: string;
  fullName: string;
}

/** AuditLogResponseDto */
export interface AuditLog {
  id: number;
  action: AuditAction;
  tableName: string;
  recordId: number | null;
  userId: number | null;
  user: AuditActor | null;
  oldValue: unknown;
  newValue: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export const AUDIT_ACTIONS: AuditAction[] = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'BULK_CREATE',
  'BULK_UPDATE',
  'BULK_DELETE',
];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  CREATE: 'สร้าง',
  UPDATE: 'แก้ไข',
  DELETE: 'ลบ',
  BULK_CREATE: 'สร้างหลายรายการ',
  BULK_UPDATE: 'แก้ไขหลายรายการ',
  BULK_DELETE: 'ลบหลายรายการ',
};

/** ชื่อตารางที่พบบ่อย — ใช้แสดงผลเป็นภาษาไทยและเป็นตัวเลือกตัวกรอง */
export const AUDIT_TABLE_LABELS: Record<string, string> = {
  users: 'ผู้ใช้',
  roles: 'บทบาท',
  role_permissions: 'สิทธิ์ของบทบาท',
  user_roles: 'บทบาทของผู้ใช้',
  permissions: 'สิทธิ์',
  customers: 'ลูกค้า',
  contacts: 'ผู้ติดต่อ',
  communication_logs: 'ประวัติการติดต่อ',
  projects: 'โครงการ',
  tasks: 'งานย่อย',
};

export const AUDIT_TABLES: string[] = Object.keys(AUDIT_TABLE_LABELS);

export function auditTableLabel(tableName: string): string {
  return AUDIT_TABLE_LABELS[tableName] ?? tableName;
}
