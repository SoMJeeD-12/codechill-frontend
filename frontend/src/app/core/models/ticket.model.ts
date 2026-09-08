export type TicketStatus =
  | 'RECEIVED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'REOPENED'
  | 'CLOSED';

export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type BillingType =
  | 'WARRANTY'
  | 'QUOTA'
  | 'ADDON'
  | 'PER_CASE'
  | 'FREE';

export type ReportedChannel = 'LINE' | 'FACEBOOK' | 'PHONE' | 'EMAIL' | 'ONSITE' | 'OTHER';

export type ResolutionResult = 'SUCCESS' | 'PARTIAL' | 'FAILED';

export interface Ticket {
  id: number;
  ticketNo: string;
  customerId: number;
  projectId: number | null;
  title: string;
  description: string;
  category: string;
  priority: TicketPriority;
  status: TicketStatus;
  billingType: BillingType;
  chargeAmount: number;
  reportedChannel: ReportedChannel;
  reportedAt: string;
  receivedByUserId: number;
  assigneeId: number | null;
  resolutionCount: number;
  closedAt: string | null;
  attachmentName: string | null;
}

export interface TicketResolution {
  id: number;
  ticketId: number;
  round: number;
  rootCause: string;
  actionTaken: string;
  spentHour: number;
  result: ResolutionResult;
  resolvedByUserId: number;
  resolvedAt: string;
}

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  RECEIVED: 'รับเรื่อง',
  IN_PROGRESS: 'กำลังดำเนินการ',
  RESOLVED: 'แก้ไขเรียบร้อย',
  REOPENED: 'กลับมาเป็นซ้ำ',
  CLOSED: 'ปิดงาน',
};

export const BILLING_TYPE_LABELS: Record<BillingType, string> = {
  WARRANTY: 'ในประกัน',
  QUOTA: 'ใช้โควตา',
  ADDON: 'ใช้ Add-on',
  PER_CASE: 'คิดเป็นครั้ง',
  FREE: 'ไม่คิดเงิน',
};

export const REPORTED_CHANNEL_LABELS: Record<ReportedChannel, string> = {
  LINE: 'LINE',
  FACEBOOK: 'Facebook',
  PHONE: 'โทรศัพท์',
  EMAIL: 'อีเมล',
  ONSITE: 'พบหน้า',
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
  'RESOLVED',
];
