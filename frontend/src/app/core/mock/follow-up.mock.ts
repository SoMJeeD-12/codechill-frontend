import { FollowUp } from '../models/follow-up.model';

export interface FollowUpMockSeedContext {
  customerId: number;
  assigneeId: number | null;
  secondCustomerId?: number | null;
}

/** แผนติดตามตัวอย่าง — M7 mock รอ API */
export function buildMockFollowUps(ctx: FollowUpMockSeedContext): FollowUp[] {
  const now = new Date();
  const iso = (d: Date) => d.toISOString();
  const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

  const overdue = new Date(now);
  overdue.setDate(overdue.getDate() - 5);
  const today = new Date(now);
  const soon = new Date(now);
  soon.setDate(soon.getDate() + 3);
  const later = new Date(now);
  later.setDate(later.getDate() + 14);

  return [
    {
      id: 1,
      customerId: ctx.customerId,
      title: 'ติดตามหลังส่งมอบรอบที่ 1',
      dueDate: dateOnly(overdue),
      assigneeId: ctx.assigneeId,
      channel: 'PHONE',
      status: 'PLANNED',
      note: 'เลยกำหนดแล้ว — ใช้ทดสอบมุมมองค้างติดตาม',
      completedAt: null,
      createdAt: iso(overdue),
      updatedAt: iso(overdue),
    },
    {
      id: 2,
      customerId: ctx.customerId,
      title: 'เช็คความพึงพอใจหลังแก้ปัญหา',
      dueDate: dateOnly(today),
      assigneeId: ctx.assigneeId,
      channel: 'LINE',
      status: 'PLANNED',
      note: 'ครบกำหนดวันนี้',
      completedAt: null,
      createdAt: iso(now),
      updatedAt: iso(now),
    },
    {
      id: 3,
      customerId: ctx.secondCustomerId ?? ctx.customerId,
      title: 'นัดคุยต่อสัญญา MA',
      dueDate: dateOnly(soon),
      assigneeId: ctx.assigneeId,
      channel: 'ONSITE',
      status: 'PLANNED',
      note: null,
      completedAt: null,
      createdAt: iso(now),
      updatedAt: iso(now),
    },
    {
      id: 4,
      customerId: ctx.customerId,
      title: 'ติดตามใช้งานคลังสินค้า',
      dueDate: dateOnly(later),
      assigneeId: ctx.assigneeId,
      channel: 'EMAIL',
      status: 'DONE',
      note: 'ลูกค้าใช้งานได้ปกติ',
      completedAt: iso(now),
      createdAt: iso(later),
      updatedAt: iso(now),
    },
  ];
}
