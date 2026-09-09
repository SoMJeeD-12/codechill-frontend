export type FollowUpStatus = 'PLANNED' | 'DONE' | 'CANCELLED';

export type FollowUpChannel = 'PHONE' | 'LINE' | 'EMAIL' | 'ONSITE' | 'OTHER';

/**
 * แผนติดตามลูกค้า (M7)
 * เส้นทางที่คาดไว้: /api/follow-ups
 */
export interface FollowUp {
  id: number;
  customerId: number;
  title: string;
  dueDate: string;
  assigneeId: number | null;
  channel: FollowUpChannel;
  status: FollowUpStatus;
  note: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const FOLLOW_UP_STATUS_LABELS: Record<FollowUpStatus, string> = {
  PLANNED: 'วางแผนไว้',
  DONE: 'ติดตามแล้ว',
  CANCELLED: 'ยกเลิก',
};

export const FOLLOW_UP_CHANNEL_LABELS: Record<FollowUpChannel, string> = {
  PHONE: 'โทรศัพท์',
  LINE: 'LINE',
  EMAIL: 'อีเมล',
  ONSITE: 'เข้าพบ',
  OTHER: 'อื่นๆ',
};
