import { AppNotification, NotificationRule } from '../models/notification.model';

/** กติกาแจ้งเตือนเริ่มต้น — M11 mock (LINE จริงรอทีหลัง) */
export const MOCK_NOTIFICATION_RULES: NotificationRule[] = [
  {
    id: 1,
    code: 'WARRANTY_30D',
    name: 'ประกันใกล้หมดอายุ',
    trigger: 'WARRANTY_EXPIRY',
    channel: 'IN_APP',
    daysBefore: 30,
    enabled: true,
    description: 'แจ้งในระบบเมื่อประกันเหลือ ≤ 30 วัน',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 2,
    code: 'MA_QUOTA_2',
    name: 'โควตา MA ใกล้หมด',
    trigger: 'MA_QUOTA_LOW',
    channel: 'IN_APP',
    daysBefore: 0,
    enabled: true,
    description: 'แจ้งเมื่อโควตาเหลือ ≤ 2 เคส',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 3,
    code: 'FOLLOW_UP_DUE',
    name: 'ติดตามเลยกำหนด',
    trigger: 'FOLLOW_UP_OVERDUE',
    channel: 'LINE_MOCK',
    daysBefore: 0,
    enabled: true,
    description: 'จำลองส่ง LINE เมื่อแผนติดตามเลยกำหนด (ยังไม่ต่อ Messaging API)',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 4,
    code: 'TICKET_REOPEN',
    name: 'ปัญหาเดิมกลับมา',
    trigger: 'TICKET_REOPENED',
    channel: 'IN_APP',
    daysBefore: 0,
    enabled: false,
    description: 'แจ้งเมื่อเปิดใบเดิมซ้ำ — ปิดไว้เป็นค่าเริ่มต้น',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

export function buildMockNotifications(userId: number): AppNotification[] {
  const now = Date.now();
  return [
    {
      id: 1,
      userId,
      title: 'ประกันใกล้หมดอายุ',
      body: 'โปรเจคคลังสินค้า — ประกันเหลือประมาณ 25 วัน',
      trigger: 'WARRANTY_EXPIRY',
      link: '/app/warranties',
      createdAt: new Date(now - 2 * 3600_000).toISOString(),
      readAt: null,
    },
    {
      id: 2,
      userId,
      title: 'โควตา MA ใกล้หมด',
      body: 'สัญญาแผนมาตรฐาน เหลือโควตา 2 เคส',
      trigger: 'MA_QUOTA_LOW',
      link: '/app/ma',
      createdAt: new Date(now - 26 * 3600_000).toISOString(),
      readAt: null,
    },
    {
      id: 3,
      userId,
      title: 'ติดตามเลยกำหนด',
      body: '「ติดตามหลังส่งมอบรอบที่ 1」เลยมาแล้ว 5 วัน',
      trigger: 'FOLLOW_UP_OVERDUE',
      link: '/app/follow-ups',
      createdAt: new Date(now - 50 * 3600_000).toISOString(),
      readAt: new Date(now - 40 * 3600_000).toISOString(),
    },
  ];
}
