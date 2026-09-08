export type NotificationTrigger =
  | 'WARRANTY_EXPIRY'
  | 'MA_QUOTA_LOW'
  | 'FOLLOW_UP_OVERDUE'
  | 'TICKET_REOPENED'
  | 'MANUAL';

export type NotificationChannel = 'IN_APP' | 'LINE_MOCK';

export interface NotificationRule {
  id: number;
  code: string;
  name: string;
  trigger: NotificationTrigger;
  channel: NotificationChannel;
  /** แจ้งล่วงหน้ากี่วัน (ใช้กับวันหมดอายุ/ครบกำหนด) */
  daysBefore: number;
  enabled: boolean;
  description: string;
}

export interface AppNotification {
  id: number;
  userId: number;
  title: string;
  body: string;
  trigger: NotificationTrigger;
  link: string | null;
  createdAt: string;
  readAt: string | null;
}

export const NOTIFICATION_TRIGGER_LABELS: Record<NotificationTrigger, string> = {
  WARRANTY_EXPIRY: 'ประกันใกล้หมดอายุ',
  MA_QUOTA_LOW: 'โควตา MA ใกล้หมด',
  FOLLOW_UP_OVERDUE: 'ติดตามเลยกำหนด',
  TICKET_REOPENED: 'ปัญหาเดิมกลับมา',
  MANUAL: 'แจ้งด้วยมือ',
};

export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
  IN_APP: 'ในระบบ',
  LINE_MOCK: 'LINE',
};
