import type { Attachment } from './attachment.model';

/** ตาม TicketResponseDto.status (BE C-1) */
export type TicketStatus =
  | 'RECEIVED'
  | 'WAITING_ADMIN'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'WAITING_SUPPORT'
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

/** ขั้นในรอบแก้ไข — จาก GET /tickets/:id → resolutions[].steps */
export interface TicketResolutionStep {
  code: string;
  label: string;
  at: string | null;
  result: ResolutionResult | string | null;
}

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
  /** แอดมินผู้รับคิว (claim) — คนละคนกับ assignedUser / receivedByUser */
  claimedByAdminUserId: number | null;
  assignedUserId: number | null;
  warrantyId: number | null;
  maContractId: number | null;
  /** เลขที่ใบรับประกัน / สัญญา MA จาก BE — แสดงแทน #id */
  warrantyNo?: string | null;
  maContractNo?: string | null;
  resolutionCount: number;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  dueAt: string | null;
  /** จาก API — ห้ามคำนวณเองจาก dueAt */
  isOverdue?: boolean;
  customer?: { id: number; name: string } | null;
  project?: { id: number; name: string; code?: string | null; status?: string | null } | null;
  resolutions?: TicketResolution[];
  /** GET /tickets/:id — ลำดับเหตุการณ์จาก BE เรียงเก่า → ใหม่ */
  history?: TicketHistoryEntry[];
  createdAt?: string;
  updatedAt?: string;
}

export type TicketHistoryCode =
  | 'CREATED'
  | 'SENT_TO_ADMIN'
  | 'CLAIMED'
  | 'ASSIGNED'
  | 'REASSIGNED'
  | 'UNASSIGNED'
  | 'STARTED'
  | 'RESOLVED'
  | 'REVIEW_REJECTED'
  | 'RETURNED_TO_SUPPORT'
  | 'CUSTOMER_NOTIFIED'
  | 'CLOSED'
  | 'REOPENED'
  | 'STATUS_CHANGED';

export interface TicketHistoryEntry {
  code: TicketHistoryCode | string;
  label: string;
  at: string;
  /** null = ระบบทำเอง */
  actor: { id: number; fullName: string } | null;
  fromStatus: string | null;
  toStatus: string | null;
  assignee: { id: number; fullName: string } | null;
  note: string | null;
}

export interface TicketResolution {
  id: number;
  ticketId: number;
  round: number;
  result: ResolutionResult;
  detail: string;
  rootCause: string | null;
  resolvedByUserId: number | null;
  /** สรุปผู้แก้จาก API (ถ้ามี) */
  resolvedBy?: { id: number; username: string; fullName: string } | null;
  startedAt: string | null;
  resolvedAt: string;
  hoursSpent: number | null;
  /** ลำดับงานในรอบ — ใช้เป็น stepper */
  steps: TicketResolutionStep[];
  /**
   * ไฟล์แนบของรอบ (รวมสแกนใบยืนยัน)
   * อัปโหลดผ่าน POST /attachments ตาม attachScanHint จาก confirmation-print
   */
  attachments: Attachment[];
  createdAt?: string;
}

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  RECEIVED: 'รับเรื่อง',
  /** ซัพพอร์ตส่งเข้าคิวกลางแล้ว — รอแอดมินรับเรื่อง/มอบหมาย */
  WAITING_ADMIN: 'รอแอดมิน',
  /** BE: หลังมอบหมาย — ยังไม่เริ่มดำเนินการ */
  ASSIGNED: 'รอเริ่มงาน',
  IN_PROGRESS: 'กำลังดำเนินการ',
  /** แก้เสร็จแล้ว — รอแอดมินตรวจ */
  RESOLVED: 'แก้ไขแล้ว',
  /** แอดมินตรวจผ่านแล้ว — รอซัพพอร์ตแจ้งลูกค้า */
  WAITING_SUPPORT: 'รอแจ้งลูกค้า',
  /** ปัญหาเดิมกลับมาแล้ว แต่ยังไม่มีคนรับงานรอบใหม่ */
  REOPENED: 'รอรับงานรอบใหม่',
  CLOSED: 'ปิดงาน',
};

/** ป้ายสถานะ — กันค่าใหม่จาก BE ที่ FE ยังไม่รู้จัก ไม่ให้เป็นค่าว่าง */
export function ticketStatusLabel(status: string | null | undefined): string {
  if (!status) {
    return '—';
  }
  return TICKET_STATUS_LABELS[status as TicketStatus] ?? status;
}

/** ลำดับ stepper หลักของใบปัญหา (ไม่รวม REOPENED) */
export const TICKET_STEPPER_STATUSES: TicketStatus[] = [
  'RECEIVED',
  'WAITING_ADMIN',
  'ASSIGNED',
  'IN_PROGRESS',
  'RESOLVED',
  'WAITING_SUPPORT',
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
  SUCCESS: 'งานรอบนี้จบแล้ว — ใบจะไปขั้นรอแอดมินตรวจ',
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

/**
 * วันรับเรื่องที่แสดงในคิว — ใบที่ปัญหาเดิมกลับมา (reopen) ใช้วันของรอบล่าสุด ไม่ใช้วันแจ้งครั้งแรก
 * BE ไม่มีฟิลด์วันที่ reopen ในรายการ → ใช้ updatedAt (การกระทำล่าสุดคือ reopen/ส่งเข้าคิว)
 */
export function ticketQueueDate(t: Pick<Ticket, 'status' | 'description' | 'reportedAt' | 'updatedAt'>): string {
  const reopened =
    t.status === 'REOPENED' || !!t.description?.includes(TICKET_REOPEN_NOTE_PREFIX);
  return (reopened && t.updatedAt) || t.reportedAt;
}

/** บรรทัดที่ BE ต่อท้าย description ตอนแอดมินตีกลับผลแก้ */
export const TICKET_REVIEW_REJECT_PREFIX = '[ตรวจไม่ผ่าน]';

/** ป้ายบรรทัดที่ระบบต่อท้าย description — ผู้ใช้ห้ามแก้ */
const TICKET_SYSTEM_LINE_PREFIXES = [
  TICKET_REOPEN_NOTE_PREFIX,
  TICKET_REVIEW_REJECT_PREFIX,
  '[ตรวจผ่าน]',
  '[ปิดงาน]',
];

/** แยกข้อความที่ผู้ใช้พิมพ์ออกจากบรรทัดที่ระบบต่อท้าย — ใช้ในฟอร์มแก้ใบ */
export function splitTicketSystemLines(raw: string | null | undefined): {
  base: string;
  systemLines: string[];
} {
  const text = (raw ?? '').replace(/\r\n/g, '\n');
  const baseParts: string[] = [];
  const systemLines: string[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (TICKET_SYSTEM_LINE_PREFIXES.some((p) => trimmed.startsWith(p))) {
      systemLines.push(trimmed);
    } else {
      baseParts.push(line);
    }
  }
  return { base: baseParts.join('\n').replace(/\n{3,}/g, '\n\n').trim(), systemLines };
}

export interface TicketAppendedNote {
  kind: 'reopen' | 'reject';
  text: string;
}

export function splitTicketDescription(raw: string | null | undefined): {
  base: string;
  /** เก่า → ใหม่ ตามลำดับที่ต่อใน description */
  reopenNotes: string[];
  /** บรรทัดที่ระบบต่อท้าย (เปิดกลับมา / ตรวจไม่ผ่าน) เก่า → ใหม่ */
  notes: TicketAppendedNote[];
} {
  const text = (raw ?? '').replace(/\r\n/g, '\n').trim();
  if (!text) {
    return { base: '', reopenNotes: [], notes: [] };
  }

  const notes: TicketAppendedNote[] = [];
  const baseParts: string[] = [];

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith(TICKET_REOPEN_NOTE_PREFIX)) {
      const note = trimmed.slice(TICKET_REOPEN_NOTE_PREFIX.length).trim();
      notes.push({ kind: 'reopen', text: note || 'ไม่ระบุอาการ' });
    } else if (trimmed.startsWith(TICKET_REVIEW_REJECT_PREFIX)) {
      const note = trimmed.slice(TICKET_REVIEW_REJECT_PREFIX.length).trim();
      notes.push({ kind: 'reject', text: note || 'ไม่ระบุเหตุผล' });
    } else {
      baseParts.push(line);
    }
  }

  return {
    base: baseParts.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    reopenNotes: notes.filter((n) => n.kind === 'reopen').map((n) => n.text),
    notes,
  };
}

/** สถานะที่ถือว่ายังค้าง — แสดงในหน้ารอรับแก้ไข */
export const OPEN_TICKET_STATUSES: TicketStatus[] = [
  'RECEIVED',
  'WAITING_ADMIN',
  'ASSIGNED',
  'IN_PROGRESS',
  'REOPENED',
];

export type TicketTimelineTone = 'neutral' | 'info' | 'progress' | 'success' | 'warn' | 'danger';

export interface TicketTimelineEvent {
  id: string;
  code: string;
  at: string | null;
  label: string;
  /** ชื่อผู้ทำ · null = ระบบทำเอง */
  actorName: string | null;
  assigneeName: string | null;
  /** เหตุผล/หมายเหตุ — ตีกลับ / ส่งคืนซัพพอร์ต */
  note: string | null;
  icon: string;
  tone: TicketTimelineTone;
}

const TIMELINE_STYLE: Record<string, { icon: string; tone: TicketTimelineTone }> = {
  CREATED: { icon: 'note_add', tone: 'neutral' },
  SENT_TO_ADMIN: { icon: 'forward_to_inbox', tone: 'info' },
  CLAIMED: { icon: 'pan_tool', tone: 'info' },
  ASSIGNED: { icon: 'person_add', tone: 'info' },
  REASSIGNED: { icon: 'swap_horiz', tone: 'info' },
  UNASSIGNED: { icon: 'person_remove', tone: 'warn' },
  STARTED: { icon: 'play_arrow', tone: 'progress' },
  RESOLVED: { icon: 'task_alt', tone: 'success' },
  REVIEW_REJECTED: { icon: 'undo', tone: 'danger' },
  RETURNED_TO_SUPPORT: { icon: 'keyboard_return', tone: 'warn' },
  CUSTOMER_NOTIFIED: { icon: 'campaign', tone: 'info' },
  CLOSED: { icon: 'lock', tone: 'success' },
  REOPENED: { icon: 'replay', tone: 'danger' },
  STATUS_CHANGED: { icon: 'sync_alt', tone: 'neutral' },
};

/** แปลง `history` จาก GET /tickets/:id — BE เรียงเก่า → ใหม่ และส่ง label ภาษาไทยมาแล้ว */
export function ticketTimelineFromHistory(
  history: TicketHistoryEntry[] | null | undefined
): TicketTimelineEvent[] {
  return (history ?? []).map((h, index) => {
    const style = TIMELINE_STYLE[h.code] ?? { icon: 'radio_button_checked', tone: 'neutral' };
    return {
      id: `${index}-${h.code}`,
      code: h.code,
      at: h.at,
      label: h.label,
      actorName: h.actor?.fullName ?? null,
      assigneeName: h.assignee?.fullName ?? null,
      note: h.note?.trim() || null,
      icon: style.icon,
      tone: style.tone,
    };
  });
}
