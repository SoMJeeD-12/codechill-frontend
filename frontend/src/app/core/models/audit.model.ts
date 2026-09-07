export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS_CHANGE' | 'LOGIN';

export type AuditEntityType =
  | 'customer'
  | 'project'
  | 'ticket'
  | 'warranty'
  | 'ma'
  | 'follow-up'
  | 'document'
  | 'user'
  | 'role'
  | 'notification'
  | 'system';

export interface AuditLog {
  id: number;
  actorUserId: number | null;
  actorName: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: number | null;
  summary: string;
  createdAt: string;
}

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  CREATE: 'สร้าง',
  UPDATE: 'แก้ไข',
  DELETE: 'ลบ',
  STATUS_CHANGE: 'เปลี่ยนสถานะ',
  LOGIN: 'เข้าสู่ระบบ',
};

export const AUDIT_ENTITY_LABELS: Record<AuditEntityType, string> = {
  customer: 'ลูกค้า',
  project: 'โครงการ',
  ticket: 'ปัญหา',
  warranty: 'ประกัน',
  ma: 'สัญญา MA',
  'follow-up': 'ติดตามลูกค้า',
  document: 'เอกสาร',
  user: 'ผู้ใช้',
  role: 'บทบาท',
  notification: 'การแจ้งเตือน',
  system: 'ระบบ',
};
