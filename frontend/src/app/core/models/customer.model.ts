import { MenuCode, PermissionAction } from './permission.model';

export type CustomerStatus = 'NEW' | 'ACTIVE' | 'INACTIVE' | 'CANCELLED';

export type CommunicationChannel = 'LINE' | 'FACEBOOK' | 'PHONE' | 'EMAIL' | 'ONSITE' | 'OTHER';

export interface Customer {
  id: number;
  name: string;
  taxId: string;
  address: string;
  businessType: string;
  status: CustomerStatus;
  lifetimeValue: number;
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  id: number;
  customerId: number;
  fullName: string;
  position: string;
  phone: string;
  email: string;
  isPrimary: boolean;
}

export interface CommunicationLog {
  id: number;
  customerId: number;
  channel: CommunicationChannel;
  summary: string;
  contactedAt: string;
  createdByName: string;
  /** mock: ชื่อไฟล์หลักฐาน */
  attachmentName: string | null;
}

export const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
  NEW: 'ลูกค้าใหม่',
  ACTIVE: 'ปัจจุบัน',
  INACTIVE: 'ไม่ได้ใช้บริการแล้ว',
  CANCELLED: 'ยกเลิก',
};

export const CHANNEL_LABELS: Record<CommunicationChannel, string> = {
  LINE: 'LINE',
  FACEBOOK: 'Facebook',
  PHONE: 'โทรศัพท์',
  EMAIL: 'อีเมล',
  ONSITE: 'พบหน้า',
  OTHER: 'อื่นๆ',
};

export const PERMISSION_ACTIONS: { code: PermissionAction; label: string }[] = [
  { code: 'view', label: 'ดู' },
  { code: 'create', label: 'เพิ่ม' },
  { code: 'edit', label: 'แก้ไข' },
  { code: 'delete', label: 'ลบ' },
];

export const ROLE_EDITABLE_MENUS: { code: MenuCode; label: string }[] = [
  { code: 'dashboard', label: 'ภาพรวม' },
  { code: 'customers', label: 'ลูกค้า' },
  { code: 'projects', label: 'โครงการ' },
  { code: 'tickets', label: 'ปัญหา / ซัพพอร์ต' },
  { code: 'warranties', label: 'การรับประกัน' },
  { code: 'ma', label: 'สัญญาบำรุงรักษา' },
  { code: 'follow-ups', label: 'ติดตามลูกค้า' },
  { code: 'surveys', label: 'แบบประเมิน' },
  { code: 'documents', label: 'เอกสาร' },
  { code: 'reports', label: 'รายงาน' },
  { code: 'notifications', label: 'การแจ้งเตือน' },
  { code: 'users', label: 'ผู้ใช้งาน' },
  { code: 'roles', label: 'บทบาทและสิทธิ์' },
  { code: 'audit-logs', label: 'บันทึกการใช้งาน' },
];
