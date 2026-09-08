import { UserSummary } from './user.model';

export type CustomerStatus = 'PROSPECT' | 'ACTIVE' | 'INACTIVE' | 'CHURNED';

export type CommunicationChannel =
  | 'LINE'
  | 'PHONE'
  | 'EMAIL'
  | 'FACEBOOK'
  | 'MEETING'
  | 'OTHER';

/** ContactResponseDto */
export interface Contact {
  id: number;
  customerId: number;
  name: string;
  nickname: string | null;
  position: string | null;
  phone: string | null;
  email: string | null;
  lineId: string | null;
  isPrimary: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

/** CustomerResponseDto */
export interface Customer {
  id: number;
  code: string | null;
  name: string;
  taxId: string | null;
  businessType: string | null;
  address: string | null;
  province: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  lineOfficialId: string | null;
  facebookUrl: string | null;
  status: CustomerStatus;
  source: string | null;
  ownerUserId: number | null;
  owner: UserSummary | null;
  lastContactedAt: string | null;
  daysSinceLastContact: number | null;
  note: string | null;
  contacts: Contact[];
  createdAt: string;
  updatedAt: string;
}

/** CommunicationLogResponseDto */
export interface CommunicationLog {
  id: number;
  customerId: number;
  contactId: number | null;
  channel: CommunicationChannel;
  occurredAt: string;
  subject: string | null;
  content: string | null;
  handledByUserId: number | null;
  handledBy: UserSummary | null;
  contactName: string | null;
  createdAt: string;
  updatedAt: string;
}

export const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
  PROSPECT: 'ผู้มุ่งหวัง',
  ACTIVE: 'ปัจจุบัน',
  INACTIVE: 'ไม่ได้ใช้บริการแล้ว',
  CHURNED: 'ยกเลิก',
};

export const CHANNEL_LABELS: Record<CommunicationChannel, string> = {
  LINE: 'LINE',
  PHONE: 'โทรศัพท์',
  EMAIL: 'อีเมล',
  FACEBOOK: 'Facebook',
  MEETING: 'พบหน้า',
  OTHER: 'อื่นๆ',
};
