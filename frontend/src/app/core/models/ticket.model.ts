export type TicketStatus =
  | 'RECEIVED'
  | 'ASSIGNED'
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
  /** จาก API — ห้ามคำนวณเองจาก dueAt */
  isOverdue?: boolean;
  customer?: { id: number; name: string } | null;
  project?: { id: number; name: string } | null;
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
  /** BE: หลังมอบหมาย — ยังไม่เริ่มดำเนินการ */
  ASSIGNED: 'ส่งงานแล้ว',
  IN_PROGRESS: 'กำลังดำเนินการ',
  RESOLVED: 'แก้ไขแล้ว',
  /** ปัญหาเดิมกลับมาแล้ว แต่ยังไม่มีคนรับงานรอบใหม่ */
  REOPENED: 'รอรับงานรอบใหม่',
  CLOSED: 'ปิดงาน',
};

/** ลำดับ stepper หลักของใบปัญหา (ไม่รวม REOPENED) */
export const TICKET_STEPPER_STATUSES: TicketStatus[] = [
  'RECEIVED',
  'ASSIGNED',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
];

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  LOW: 'ต่ำ',
  NORMAL: 'ปานกลาง',
  HIGH: 'สูง',
  URGENT: 'ด่วนมาก',
};

export const BILLING_TYPE_LABELS: Record<BillingType, string> = {
  WARRANTY: 'ในประกัน',
  MA_QUOTA: 'ใช้โควตา MA',
  ADDON: 'เกี่ยวข้องกับ Add-on',
  ONE_TIME: 'คิดค่าบริการเป็นครั้ง',
  FREE: 'ช่วยฟรี (บันทึกไว้)',
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

/** คำอธิบายผลลัพธ์รอบแก้ — ใช้ในฟอร์ม */
export const RESOLUTION_RESULT_HINTS: Record<ResolutionResult, string> = {
  SUCCESS: 'งานรอบนี้จบแล้ว — ใบจะไปขั้นรอปิดงาน',
  PARTIAL: 'ยังไม่จบ / ส่งต่อได้ — ใบยังคงกำลังดำเนินการ บันทึกรอบถัดไปเมื่อทำต่อจนสำเร็จ',
  FAILED: 'รอบนี้แก้ไม่สำเร็จ — ใบยังคงกำลังดำเนินการ ให้ทำต่อหรือส่งต่อ',
};

export function isIncompleteResolutionResult(result: ResolutionResult): boolean {
  return result === 'PARTIAL' || result === 'FAILED';
}

/** รอบแก้ไขล่าสุด (เลขรอบสูงสุด) */
export function latestTicketResolution(
  ticket: Pick<Ticket, 'resolutions'> | null | undefined
): TicketResolution | null {
  const list = ticket?.resolutions ?? [];
  if (!list.length) {
    return null;
  }
  return [...list].sort((a, b) => b.round - a.round)[0] ?? null;
}

/**
 * สถานะ workflow บน UI:
 * ถ้า API ดันเป็น RESOLVED แต่รอบล่าสุดเป็น PARTIAL/FAILED → ถือว่ายัง IN_PROGRESS
 */
export function ticketWorkflowStatus(ticket: Ticket): TicketStatus {
  if (ticket.status === 'RESOLVED') {
    const last = latestTicketResolution(ticket);
    if (last && isIncompleteResolutionResult(last.result)) {
      return 'IN_PROGRESS';
    }
  }
  return ticket.status;
}

/**
 * BE ต่อเหตุผล reopen ลง `description` เป็นบรรทัด
 * `[เปิดกลับมาอีกครั้ง] อาการ…`
 */
export const TICKET_REOPEN_NOTE_PREFIX = '[เปิดกลับมาอีกครั้ง]';

export function splitTicketDescription(raw: string | null | undefined): {
  base: string;
  /** เก่า → ใหม่ ตามลำดับที่ต่อใน description */
  reopenNotes: string[];
} {
  const text = (raw ?? '').replace(/\r\n/g, '\n').trim();
  if (!text) {
    return { base: '', reopenNotes: [] };
  }

  const reopenNotes: string[] = [];
  const baseParts: string[] = [];

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith(TICKET_REOPEN_NOTE_PREFIX)) {
      const note = trimmed.slice(TICKET_REOPEN_NOTE_PREFIX.length).trim();
      reopenNotes.push(note || 'ไม่ระบุอาการ');
    } else {
      baseParts.push(line);
    }
  }

  return {
    base: baseParts.join('\n').trim(),
    reopenNotes,
  };
}

/** สถานะที่ถือว่ายังค้าง — แสดงในหน้ารอรับแก้ไข */
export const OPEN_TICKET_STATUSES: TicketStatus[] = [
  'RECEIVED',
  'ASSIGNED',
  'IN_PROGRESS',
  'REOPENED',
];

export interface TicketTimelineEvent {
  id: string;
  at: string | null;
  label: string;
  detail?: string;
  /** สร้างจากข้อมูลที่มี / overlay ตัวอย่าง */
  demo?: boolean;
}

/** สร้าง timeline จากใบ + รอบแก้ไข (+ overlay ถ้ามี) — สำหรับเดโม */
export function buildTicketTimeline(input: {
  ticket: Ticket;
  assignedAt?: string | null;
  assigneeName?: string;
  receiverName?: string;
}): TicketTimelineEvent[] {
  const { ticket, assignedAt, assigneeName, receiverName } = input;
  const events: TicketTimelineEvent[] = [
    {
      id: 'reported',
      at: ticket.reportedAt,
      label: 'รับเรื่อง',
      detail: receiverName ? `ผู้รับเรื่อง: ${receiverName}` : undefined,
    },
  ];

  if (ticket.assignedUserId || assignedAt) {
    events.push({
      id: 'assigned',
      at: assignedAt ?? ticket.firstResponseAt ?? ticket.reportedAt,
      label: 'ส่งให้ผู้รับผิดชอบ',
      detail: assigneeName ? `ผู้รับผิดชอบ: ${assigneeName}` : undefined,
      demo: !assignedAt && !ticket.firstResponseAt,
    });
  }

  const resolutions = [...(ticket.resolutions ?? [])].sort((a, b) => a.round - b.round);
  for (const r of resolutions) {
    events.push({
      id: `res-${r.id}`,
      at: r.resolvedAt,
      label: `บันทึกงานแก้ไขครั้งที่ ${r.round}`,
      detail: r.result,
    });
  }

  if (ticket.resolvedAt && ticket.status !== 'CLOSED') {
    const last = resolutions.length ? resolutions[resolutions.length - 1] : null;
    if (!last || last.result === 'SUCCESS') {
      events.push({
        id: 'resolved',
        at: ticket.resolvedAt,
        label: 'แก้ไขเรียบร้อย (รอปิดงาน)',
      });
    }
  }

  if (ticket.closedAt) {
    events.push({
      id: 'closed',
      at: ticket.closedAt,
      label: 'ปิดงาน',
    });
  }

  return events;
}