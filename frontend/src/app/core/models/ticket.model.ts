export type TicketStatus =
  | 'RECEIVED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'REOPENED'
  | 'CLOSED';

/** ตาม TicketResponseDto / CreateTicketDto */
export type TicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export type BillingType =
  | 'WARRANTY'
  | 'MA_QUOTA'
  | 'ADDON'
  | 'ONE_TIME'
  | 'FREE';

export type ReportedChannel = 'LINE' | 'FACEBOOK' | 'PHONE' | 'EMAIL' | 'OTHER';

export type ResolutionResult = 'SUCCESS' | 'PARTIAL' | 'FAILED';

export interface Ticket {
  id: number;
  ticketNo: string | null;
  customerId: number;
  projectId: number | null;
  title: string;
  description: string | null;
  priority: TicketPriority;
  status: TicketStatus;
  isPending: boolean;
  billingType: BillingType;
  /** ค่าใช้จ่ายเพิ่ม (จาก API เป็น string ทศนิยม) */
  extraCharge: number | null;
  reportedChannel: ReportedChannel;
  reportedAt: string;
  reportedByContactId: number | null;
  receivedByUserId: number | null;
  assignedUserId: number | null;
  warrantyId: number | null;
  maContractId: number | null;
  resolutionCount: number;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  dueAt: string | null;
  resolutions?: TicketResolution[];
  createdAt?: string;
  updatedAt?: string;
}

export interface TicketResolution {
  id: number;
  ticketId: number;
  round: number;
  result: ResolutionResult;
  detail: string;
  rootCause: string | null;
  resolvedByUserId: number | null;
  startedAt: string | null;
  resolvedAt: string;
  hoursSpent: number | null;
  createdAt?: string;
}

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  RECEIVED: 'รับเรื่อง',
  IN_PROGRESS: 'กำลังดำเนินการ',
  RESOLVED: 'แก้ไขเรียบร้อย',
  REOPENED: 'กลับมาเป็นซ้ำ',
  CLOSED: 'ปิดงาน',
};

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  LOW: 'ต่ำ',
  NORMAL: 'ปานกลาง',
  HIGH: 'สูง',
  URGENT: 'ด่วนมาก',
};

export const BILLING_TYPE_LABELS: Record<BillingType, string> = {
  WARRANTY: 'ในประกัน',
  MA_QUOTA: 'ใช้โควตา MA',
  ADDON: 'ใช้ Add-on',
  ONE_TIME: 'คิดเป็นครั้ง',
  FREE: 'ไม่คิดเงิน',
};

export const REPORTED_CHANNEL_LABELS: Record<ReportedChannel, string> = {
  LINE: 'LINE',
  FACEBOOK: 'Facebook',
  PHONE: 'โทรศัพท์',
  EMAIL: 'อีเมล',
  OTHER: 'อื่นๆ',
};

export const RESOLUTION_RESULT_LABELS: Record<ResolutionResult, string> = {
  SUCCESS: 'สำเร็จ',
  PARTIAL: 'สำเร็จบางส่วน',
  FAILED: 'ไม่สำเร็จ',
};

/** สถานะที่ถือว่ายังค้าง — แสดงในหน้ารอรับแก้ไข */
export const OPEN_TICKET_STATUSES: TicketStatus[] = [
  'RECEIVED',
  'IN_PROGRESS',
  'REOPENED',
];
