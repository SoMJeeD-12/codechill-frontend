import { Injectable, signal } from '@angular/core';
import { Ticket, TicketStatus } from '../models/ticket.model';

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

  setCategory(ticketId: number, category: TicketCategoryDemo | null): void {
    this.patch(ticketId, { category });
  }

  /**
   * สถานะที่โชว์บนหน้าจอ
   * waitingStart=true → ASSIGNED · waitingStart=false → ใช้สถานะ API
   * RECEIVED + มีผู้รับผิดชอบ (ยังไม่กดเริ่ม) → ASSIGNED
   */
  effectiveStatus(ticket: Ticket): TicketStatus {
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
    if (o.waitingStart === false) {
      return ticket.status;
    }
    if (ticket.status === 'RECEIVED' && ticket.assignedUserId) {
      return 'ASSIGNED';
    }
    return ticket.status;
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
