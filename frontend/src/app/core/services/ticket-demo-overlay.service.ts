import { Injectable, signal } from '@angular/core';
import {
  Ticket,
  TicketStatus,
  isIncompleteResolutionResult,
  latestTicketResolution,
  ticketWorkflowStatus,
} from '../models/ticket.model';

/** หมวดหมู่ปัญหา — ตัวอย่างฝั่ง FE (BE ยังไม่มีฟิลด์) */
export type TicketCategoryDemo =
  | 'BUG_FIX'
  | 'USER_SUPPORT'
  | 'TRAINING'
  | 'OTHER';

export const TICKET_CATEGORY_DEMO_LABELS: Record<TicketCategoryDemo, string> = {
  BUG_FIX: 'แก้บั๊ก / ระบบผิดพลาด',
  USER_SUPPORT: 'ซัพพอร์ตการใช้งาน',
  TRAINING: 'อบรม / พาใช้งาน',
  OTHER: 'อื่น ๆ',
};

export interface TicketDemoOverlay {
  /**
   * มอบหมายแล้ว แต่ยังไม่กด「เริ่มงาน」
   * — ใช้โชว์สถานะ ASSIGNED แม้ API ข้ามไป IN_PROGRESS
   */
  waitingStart?: boolean;
  /** เวลาที่มอบหมาย (สำหรับ timeline ตัวอย่าง) */
  assignedAt?: string;
  /** หมวดหมู่ตัวอย่าง — ไม่ส่งขึ้น API */
  category?: TicketCategoryDemo | null;
  /** ข้อความเมื่อหมวด = อื่น ๆ — ไม่ส่งขึ้น API */
  categoryOtherNote?: string | null;
  /**
   * ค่าบริการเป็นครั้ง (บาท) — ตัวอย่าง FE
   * API มี extraCharge แต่สร้าง/แก้ใบยังไม่มีช่องส่งครบ
   */
  extraCharge?: number | null;
  /**
   * รอบล่าสุดเป็น PARTIAL/FAILED แต่ API อาจดันเป็น RESOLVED
   * — ใช้กับหน้ารายการที่ไม่มี resolutions ใน payload
   */
  incompleteWork?: boolean;
  /** ผลรอบล่าสุดที่ยังไม่จบ — สำหรับป้าย「แก้ไขบางส่วน」 */
  incompleteResult?: 'PARTIAL' | 'FAILED';
}

const STORAGE_KEY = 'cpams_ticket_demo_overlay_v1';

/**
 * Overlay ตัวอย่างสำหรับเดโมเมื่อ BE ยังไม่มีฟิลด์/สถานะ
 * เก็บใน sessionStorage — รีเฟรชแท็บยังอยู่ · ปิดแท็บแล้วหาย
 * ห้ามใช้แทนของจริงหลัง BE พร้อม
 */
@Injectable({ providedIn: 'root' })
export class TicketDemoOverlayService {
  private readonly map = signal<Record<number, TicketDemoOverlay>>(this.read());

  /** ให้หน้าจอ computed อ่านแล้ว re-render เมื่อ overlay เปลี่ยน */
  readonly state = this.map.asReadonly();

  snapshot(ticketId: number): TicketDemoOverlay {
    return this.map()[ticketId] ?? {};
  }

  patch(ticketId: number, partial: TicketDemoOverlay): void {
    this.map.update((prev) => {
      const next = {
        ...prev,
        [ticketId]: { ...prev[ticketId], ...partial },
      };
      this.write(next);
      return next;
    });
  }

  /** หลังมอบหมาย — บังคับให้เห็นขั้น ASSIGNED ก่อนเริ่มงาน */
  markAssigned(ticketId: number): void {
    this.patch(ticketId, {
      waitingStart: true,
      assignedAt: new Date().toISOString(),
    });
  }

  /** ผู้รับผิดชอบกดเริ่มงานแล้ว — กลับไปใช้สถานะจาก API */
  markStarted(ticketId: number): void {
    this.patch(ticketId, { waitingStart: false });
  }

  setCategory(
    ticketId: number,
    category: TicketCategoryDemo | null,
    categoryOtherNote: string | null = null
  ): void {
    const note =
      category === 'OTHER' ? categoryOtherNote?.trim() || null : null;
    this.patch(ticketId, { category, categoryOtherNote: note });
  }

  /** ป้ายหมวดสำหรับแสดงผล — อื่น ๆ ต่อท้ายข้อความที่ระบุ */
  categoryDisplayLabel(ticketId: number): string | null {
    const snap = this.snapshot(ticketId);
    const cat = snap.category;
    if (!cat) {
      return null;
    }
    const base = TICKET_CATEGORY_DEMO_LABELS[cat];
    if (cat === 'OTHER' && snap.categoryOtherNote?.trim()) {
      return `${base} · ${snap.categoryOtherNote.trim()}`;
    }
    return base;
  }

  setExtraCharge(ticketId: number, extraCharge: number | null): void {
    this.patch(ticketId, { extraCharge });
  }

  /**
   * ยอดคิดเป็นครั้งที่โชว์บนจอ — ใช้ของ API ก่อน ถ้าไม่มีค่อยใช้ mock overlay
   * ไม่คืน 0 เมื่อยังไม่กรอก (null = ยังไม่กรอก)
   */
  effectiveExtraCharge(ticket: Pick<Ticket, 'id' | 'extraCharge'>): number | null {
    if (ticket.extraCharge != null && !Number.isNaN(ticket.extraCharge)) {
      return ticket.extraCharge;
    }
    const demo = this.snapshot(ticket.id).extraCharge;
    if (demo != null && !Number.isNaN(demo)) {
      return demo;
    }
    return null;
  }

  /** หลังบันทึกรอบ PARTIAL/FAILED — ใบยังไม่จบ */
  markIncompleteWork(
    ticketId: number,
    result: 'PARTIAL' | 'FAILED' = 'PARTIAL'
  ): void {
    this.patch(ticketId, { incompleteWork: true, incompleteResult: result });
  }

  /** หลังบันทึกรอบ SUCCESS หรือ BE คืนสถานะถูกต้อง */
  clearIncompleteWork(ticketId: number): void {
    this.patch(ticketId, { incompleteWork: false, incompleteResult: undefined });
  }

  /** sync จาก ticket ที่มี resolutions (หน้ารายละเอียด) */
  syncIncompleteWorkFromTicket(ticket: Ticket): void {
    const last = latestTicketResolution(ticket);
    if (last && isIncompleteResolutionResult(last.result)) {
      this.markIncompleteWork(
        ticket.id,
        last.result === 'FAILED' ? 'FAILED' : 'PARTIAL'
      );
      return;
    }
    if (last?.result === 'SUCCESS' || ticket.status === 'CLOSED') {
      this.clearIncompleteWork(ticket.id);
    }
  }

  /** ป้ายสถานะเมื่อยังทำต่อหลัง PARTIAL/FAILED */
  incompleteStatusLabel(ticket: Ticket): string | null {
    if (!this.isStillInProgress(ticket)) {
      return null;
    }
    const fromTicket = latestTicketResolution(ticket)?.result;
    const result =
      fromTicket === 'PARTIAL' || fromTicket === 'FAILED'
        ? fromTicket
        : this.snapshot(ticket.id).incompleteResult ?? 'PARTIAL';
    return result === 'FAILED' ? 'ยังไม่สำเร็จ' : 'แก้ไขบางส่วน';
  }

  /** ค่า data-status สำหรับสีป้าย (PARTIAL / FAILED แยกจาก RESOLVED) */
  statusAttr(ticket: Ticket): string {
    if (!this.isStillInProgress(ticket)) {
      return this.effectiveStatus(ticket);
    }
    const fromTicket = latestTicketResolution(ticket)?.result;
    const result =
      fromTicket === 'PARTIAL' || fromTicket === 'FAILED'
        ? fromTicket
        : this.snapshot(ticket.id).incompleteResult ?? 'PARTIAL';
    return result;
  }

  /**
   * สถานะที่โชว์บนหน้าจอ — ใช้สถานะจาก Backend เป็นหลัก
   * waitingStart เหลือเป็น fallback เฉพาะเมื่อ API ข้าม ASSIGNED ไป IN_PROGRESS ทันที
   */
  effectiveStatus(ticket: Ticket): TicketStatus {
    if (ticket.status === 'ASSIGNED') {
      return 'ASSIGNED';
    }
    const o = this.snapshot(ticket.id);
    if (
      o.waitingStart === true &&
      ticket.assignedUserId &&
      (ticket.status === 'IN_PROGRESS' ||
        ticket.status === 'RECEIVED' ||
        ticket.status === 'REOPENED')
    ) {
      return 'ASSIGNED';
    }
    return ticketWorkflowStatus(ticket);
  }

  private isStillInProgress(ticket: Ticket): boolean {
    if (ticketWorkflowStatus(ticket) === 'IN_PROGRESS') {
      return true;
    }
    return this.snapshot(ticket.id).incompleteWork === true;
  }

  private read(): Record<number, TicketDemoOverlay> {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw) as Record<string, TicketDemoOverlay>;
      const out: Record<number, TicketDemoOverlay> = {};
      for (const [k, v] of Object.entries(parsed)) {
        const id = Number(k);
        if (Number.isFinite(id)) {
          out[id] = v;
        }
      }
      return out;
    } catch {
      return {};
    }
  }

  private write(next: Record<number, TicketDemoOverlay>): void {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore quota */
    }
  }
}
