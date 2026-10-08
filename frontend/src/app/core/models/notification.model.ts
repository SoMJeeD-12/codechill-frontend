/** สถานะการแจ้งเตือนจาก GET /api/notifications */
export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED' | 'READ';

/** ประเภทเหตุการณ์จาก backend — ห้ามเดาค่าใหม่ */
export type NotificationEventType =
  | 'MA_EXPIRING'
  | 'WARRANTY_EXPIRING'
  | 'TASK_OVERDUE'
  | 'FOLLOWUP_DUE'
  | 'TICKET_SLA'
  | 'CUSTOMER_IDLE'
  | 'DELIVERY_DUE'
  /** C-3 สายงานใบปัญหา (inbox ในแอป) */
  | 'TICKET_SENT_TO_ADMIN'
  | 'TICKET_AWAITING_REVIEW'
  | 'TICKET_RETURNED_TO_SUPPORT'
  | 'TICKET_REVIEW_REJECTED'
  /** เลิกใช้แล้ว (7 ต.ค.) — แถวเก่ายังอ่านได้ */
  | 'DAILY_DIGEST';

/** รายการแจ้งเตือน — ของพนักงานในระบบเท่านั้น (BR-11) */
export interface AppNotification {
  id: number;
  targetUserId: number;
  eventType: NotificationEventType | string;
  title: string;
  message: string | null;
  refType: string | null;
  refId: number | null;
  status: NotificationStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  readAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface NotificationListParams {
  page?: number;
  limit?: number;
  status?: NotificationStatus;
  /** ต้องมี notification.manage — หน้า inbox ปกติห้ามส่ง */
  all?: boolean;
}

export interface NotificationListResult {
  items: AppNotification[];
  total: number;
  page: number;
  limit: number;
}

export interface NotificationNavTarget {
  commands: string[];
  queryParams?: Record<string, string>;
}

export const NOTIFICATION_STATUSES: NotificationStatus[] = [
  'PENDING',
  'SENT',
  'FAILED',
  'READ',
];

export const NOTIFICATION_STATUS_LABELS: Record<NotificationStatus, string> = {
  PENDING: 'รอดำเนินการ',
  SENT: 'ส่งแล้ว',
  FAILED: 'ล้มเหลว',
  READ: 'อ่านแล้ว',
};

export const NOTIFICATION_EVENT_LABELS: Record<NotificationEventType, string> = {
  MA_EXPIRING: 'สัญญา MA ใกล้หมดอายุ',
  WARRANTY_EXPIRING: 'ประกันใกล้หมดอายุ',
  TASK_OVERDUE: 'งานเกินกำหนด',
  FOLLOWUP_DUE: 'ถึงกำหนดติดตาม',
  TICKET_SLA: 'SLA ใบปัญหา',
  CUSTOMER_IDLE: 'ลูกค้าไม่ได้ติดต่อ',
  DELIVERY_DUE: 'ใกล้กำหนดส่งมอบ',
  TICKET_SENT_TO_ADMIN: 'ส่งใบไปคิวแอดมิน',
  TICKET_AWAITING_REVIEW: 'รอตรวจผลแก้',
  TICKET_RETURNED_TO_SUPPORT: 'แอดมินส่งกลับซัพพอร์ต',
  TICKET_REVIEW_REJECTED: 'ใบถูกตีกลับให้แก้ต่อ',
  DAILY_DIGEST: 'สรุปงานประจำวัน',
};

export function notificationEventLabel(eventType: string): string {
  return (
    NOTIFICATION_EVENT_LABELS[eventType as NotificationEventType] ?? eventType
  );
}

export function notificationStatusLabel(status: string): string {
  return (
    NOTIFICATION_STATUS_LABELS[status as NotificationStatus] ?? status
  );
}

/** ยังไม่อ่าน = ไม่ใช่ READ */
export function isNotificationUnread(n: Pick<AppNotification, 'status'>): boolean {
  return n.status !== 'READ';
}

/**
 * หน้าที่เปิดรายการตาม refType/refId — ไม่รู้จักคืน null (ห้ามเดา path)
 * มีหน้า :id จริง: TICKET / CUSTOMER / MA_CONTRACT / PROJECT
 * ไม่มีหน้า :id: TASK / FOLLOW_UP / WARRANTY → หน้ารายการ + query ให้เปิดรายการนั้นเอง
 */
export function notificationRefTarget(
  refType: string | null | undefined,
  refId: number | null | undefined,
  access: { canMyTasks?: boolean } = {}
): NotificationNavTarget | null {
  if (!refType || refId == null || !Number.isFinite(refId) || refId <= 0) {
    return null;
  }
  const id = String(refId);
  switch (refType.trim().toUpperCase()) {
    case 'TICKET':
      return { commands: ['/app/tickets', id] };
    case 'CUSTOMER':
      return { commands: ['/app/customers', id] };
    case 'MA_CONTRACT':
      return { commands: ['/app/ma', id] };
    case 'PROJECT':
      return { commands: ['/app/projects', id] };
    case 'TASK':
      return {
        commands: [access.canMyTasks ? '/app/tasks/me' : '/app/tasks'],
        queryParams: { task: id },
      };
    case 'FOLLOW_UP':
      return { commands: ['/app/follow-ups'], queryParams: { open: id } };
    case 'WARRANTY':
      return { commands: ['/app/warranties'], queryParams: { open: id } };
    default:
      return null;
  }
}

/**
 * นำทางตาม event C-3 + สิทธิ์คิว — ไม่มีคิวที่เข้าถึงได้แล้วไปหน้ารายละเอียดใบ
 */
export function notificationNavTarget(
  n: Pick<AppNotification, 'eventType' | 'refType' | 'refId'>,
  access: { canAdminQueue: boolean; canSupportQueue: boolean; canMyTasks?: boolean }
): NotificationNavTarget | null {
  const event = String(n.eventType ?? '').toUpperCase();
  const refType = String(n.refType ?? '').trim().toUpperCase();
  const refId = n.refId;

  if (event === 'TICKET_SENT_TO_ADMIN' && access.canAdminQueue) {
    return {
      commands: ['/app/tickets/admin-queue'],
      queryParams: { tab: 'AWAITING_CLAIM' },
    };
  }
  if (event === 'TICKET_AWAITING_REVIEW' && access.canAdminQueue) {
    return {
      commands: ['/app/tickets/admin-queue'],
      queryParams: { tab: 'AWAITING_REVIEW' },
    };
  }
  if (event === 'TICKET_RETURNED_TO_SUPPORT' && access.canSupportQueue) {
    return {
      commands: ['/app/tickets/support-queue'],
      queryParams: { tab: 'RETURNED' },
    };
  }

  return notificationRefTarget(refType, refId, access);
}
