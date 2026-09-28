import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { MenuCode } from '../models/permission.model';
import { AuthService } from './auth.service';
import { NotificationInboxService } from './notification-inbox.service';
import { AdminQueueTab, SupportQueueTab } from './ticket.service';

const POLL_MS = 30_000;
const DEBOUNCE_MS = 300;

/** GET /nav/counts — ช่องที่ไม่มีสิทธิ์ = null */
interface NavCountsResponse {
  ticketAdminQueue: Record<AdminQueueTab, number> | null;
  ticketSupportQueue: Record<SupportQueueTab, number> | null;
  ticketsMineOpen: number | null;
  taskReviewsPending: number | null;
  tasksMeRejected: number | null;
}

const EMPTY_ADMIN: Record<AdminQueueTab, number> = {
  AWAITING_CLAIM: 0,
  CLAIMED: 0,
  AWAITING_REVIEW: 0,
  WITH_SUPPORT: 0,
};
const EMPTY_SUPPORT: Record<SupportQueueTab, number> = { AWAITING_SEND: 0, RETURNED: 0 };

/**
 * ศูนย์รวมเลขบนเมนู sidebar + กระดิ่ง — refreshBadges() ที่เดียว
 * เลขแท็บในหน้าคิวอ่านจากชุดเดียวกันนี้ (adminTabCounts / supportTabCounts)
 * เรียกซ้ำติดกันรวมเป็นครั้งเดียว · ไม่ยิงซ้อน · poll 30 วิ เฉพาะตอนแท็บเปิดอยู่
 */
@Injectable({ providedIn: 'root' })
export class NavAttentionService {
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly inbox = inject(NotificationInboxService);
  private readonly router = inject(Router);

  private readonly adminTabsSignal = signal<Record<AdminQueueTab, number>>({ ...EMPTY_ADMIN });
  private readonly supportTabsSignal = signal<Record<SupportQueueTab, number>>({ ...EMPTY_SUPPORT });
  private readonly menuCountsSignal = signal<Partial<Record<MenuCode, number>>>({});

  private running = false;
  private inFlight = false;
  private pending = false;
  private debounceId: number | null = null;
  private timerId: number | null = null;
  private routeSub: Subscription | null = null;
  private readonly onVisibility = () => {
    if (document.visibilityState === 'visible') {
      this.startTimer();
      this.refreshBadges();
    } else {
      this.stopTimer();
    }
  };

  readonly adminTabCounts = this.adminTabsSignal.asReadonly();
  readonly supportTabCounts = this.supportTabsSignal.asReadonly();

  /** เมนูคิวแอดมิน = รอรับ + รอตรวจ · คิวซัพพอร์ต = แอดมินส่งกลับมา */
  readonly counts = computed<Partial<Record<MenuCode, number>>>(() => {
    const admin = this.adminTabsSignal();
    const support = this.supportTabsSignal();
    const next: Partial<Record<MenuCode, number>> = { ...this.menuCountsSignal() };
    const adminSum = admin.AWAITING_CLAIM + admin.AWAITING_REVIEW;
    if (adminSum > 0 && this.auth.canAccessTicketAdminQueue()) {
      next['ticket-admin-queue'] = adminSum;
    }
    if (support.RETURNED > 0 && this.auth.canAccessTicketSupportQueue()) {
      next['ticket-workflow'] = support.RETURNED;
    }
    return next;
  });

  badge(code: MenuCode): number {
    return this.counts()[code] ?? 0;
  }

  start(): void {
    if (this.running) {
      // session เพิ่งพร้อม (เช่น หลัง /auth/me) — เริ่ม inbox ถ้ายังไม่ได้เริ่ม
      this.inbox.start();
      this.refreshBadges();
      return;
    }
    this.running = true;
    this.inbox.start();
    document.addEventListener('visibilitychange', this.onVisibility);
    this.routeSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => this.refreshBadges());
    if (document.visibilityState === 'visible') {
      this.startTimer();
    }
    this.refreshBadges();
  }

  stop(): void {
    this.running = false;
    this.stopTimer();
    if (this.debounceId != null) {
      window.clearTimeout(this.debounceId);
      this.debounceId = null;
    }
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.routeSub?.unsubscribe();
    this.routeSub = null;
    this.inbox.stop();
    this.resetCounts();
  }

  /** เรียกได้ถี่ — รวมเป็นครั้งเดียวภายใน ~300ms */
  refreshBadges(): void {
    if (!this.running) {
      return;
    }
    if (this.debounceId != null) {
      window.clearTimeout(this.debounceId);
    }
    this.debounceId = window.setTimeout(() => {
      this.debounceId = null;
      this.run();
    }, DEBOUNCE_MS);
  }

  /** หน้าคิวโหลดแท็บเสร็จ (ไม่มีคำค้น) → ใช้ตัวเลขเดียวกันทันที */
  setAdminTabCount(tab: AdminQueueTab, n: number): void {
    this.adminTabsSignal.update((m) => (m[tab] === n ? m : { ...m, [tab]: n }));
  }

  setSupportTabCount(tab: SupportQueueTab, n: number): void {
    this.supportTabsSignal.update((m) => (m[tab] === n ? m : { ...m, [tab]: n }));
  }

  private startTimer(): void {
    if (this.timerId != null || !this.running) {
      return;
    }
    this.timerId = window.setInterval(() => this.run(), POLL_MS);
  }

  private stopTimer(): void {
    if (this.timerId != null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private resetCounts(): void {
    this.adminTabsSignal.set({ ...EMPTY_ADMIN });
    this.supportTabsSignal.set({ ...EMPTY_SUPPORT });
    this.menuCountsSignal.set({});
  }

  private run(): void {
    if (!this.running) {
      return;
    }
    if (this.inFlight) {
      this.pending = true;
      return;
    }
    this.auth.session();
    if (!this.auth.isAuthenticated()) {
      this.resetCounts();
      return;
    }

    this.inbox.poll();

    this.inFlight = true;
    this.http.get<NavCountsResponse>(`${environment.apiBaseUrl}/nav/counts`).subscribe({
      next: (body) => {
        this.adminTabsSignal.set({ ...EMPTY_ADMIN, ...(body?.ticketAdminQueue ?? {}) });
        this.supportTabsSignal.set({ ...EMPTY_SUPPORT, ...(body?.ticketSupportQueue ?? {}) });
        const menu: Partial<Record<MenuCode, number>> = {};
        const put = (code: MenuCode, n: number | null | undefined) => {
          if (n != null && n > 0) {
            menu[code] = n;
          }
        };
        put('tickets-mine', body?.ticketsMineOpen);
        put('tasks-review', body?.taskReviewsPending);
        put('tasks-me', body?.tasksMeRejected);
        this.menuCountsSignal.set(menu);
        this.finishRun();
      },
      // เก็บตัวเลขรอบก่อนไว้ — poll รอบหน้าลองใหม่
      error: () => this.finishRun(),
    });
  }

  private finishRun(): void {
    this.inFlight = false;
    if (this.pending) {
      this.pending = false;
      this.run();
    }
  }
}
