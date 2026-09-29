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
  /** ประโยคสรุปภาษาไทยจาก backend */
  summary?: string | null;
  /** ชื่อตารางภาษาไทยจาก backend */
  tableLabel?: string | null;
  /** รายการช่องที่เปลี่ยน — backend แปลค่าเป็นไทยแล้ว ห้ามแปลซ้ำจาก oldValue/newValue */
  changes?: AuditChange[] | null;
}

export interface AuditChange {
  field: string;
  label: string;
  from: string | null;
  to: string | null;
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

/** ตารางที่ซ่อนได้ด้วยช่อง「ซ่อนการแจ้งเตือน」 */
export const AUDIT_NOTIFICATION_TABLE = 'notifications';
