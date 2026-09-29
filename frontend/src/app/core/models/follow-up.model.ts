import { UserSummary } from './user.model';

/** สถานะใน DB — OVERDUE เป็นค่าคำนวณ อย่าเช็ค status === 'OVERDUE' */
export type FollowUpStatus = 'PLANNED' | 'DONE' | 'OVERDUE' | 'CANCELLED';

export interface FollowUpCustomerSummary {
  id: number;
  name: string;
  code: string | null;
}

export interface FollowUpProjectSummary {
  id: number;
  code: string | null;
  name: string;
}

/**
 * งานติดตามลูกค้า (M7) — FollowUpResponseDto
 * หน้าจอต้องอ่าน isOverdue ไม่ใช่ status === 'OVERDUE'
 */
export interface FollowUp {
  id: number;
  customerId: number;
  customer: FollowUpCustomerSummary | null;
  projectId: number | null;
  project?: FollowUpProjectSummary | null;
  title: string;
  detail: string | null;
  dueDate: string;
  status: FollowUpStatus;
  isOverdue: boolean;
  daysUntilDue: number;
  assignedUserId: number | null;
  assignedUser: UserSummary | null;
  completedAt: string | null;
  resultNote: string | null;
  createdAt: string;
  updatedAt: string;
}

/** ผลของ PATCH /follow-ups/:id/complete — งานที่ปิด + งานครั้งถัดไป (ถ้าส่ง nextDueDate) */
export interface FollowUpCompleteResult extends FollowUp {
  nextFollowUp: FollowUp | null;
}

/** สถานะที่ตั้งผ่าน PATCH ได้ (ห้ามส่ง OVERDUE) */
export type FollowUpWritableStatus = 'PLANNED' | 'DONE' | 'CANCELLED';

export const FOLLOW_UP_STATUS_LABELS: Record<FollowUpWritableStatus, string> = {
  PLANNED: 'วางแผนไว้',
  DONE: 'ติดตามแล้ว',
  CANCELLED: 'ยกเลิก',
};

export function followUpDisplayStatus(f: FollowUp): string {
  if (f.isOverdue && f.status === 'PLANNED') {
    return 'เลยกำหนด';
  }
  if (f.status === 'OVERDUE') {
    return 'เลยกำหนด';
  }
  return FOLLOW_UP_STATUS_LABELS[f.status as FollowUpWritableStatus] ?? f.status;
}
