import { Injectable, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Observable, Subscription, forkJoin, of } from 'rxjs';
import { catchError, filter, map } from 'rxjs/operators';
import { MenuCode } from '../models/permission.model';
import { AuthService } from './auth.service';
import { NotificationInboxService } from './notification-inbox.service';
import { ProjectService } from './project.service';
import { AdminQueueTab, SupportQueueTab, TicketService } from './ticket.service';

const POLL_MS = 30_000;
const DEBOUNCE_MS = 300;

const ADMIN_TABS: AdminQueueTab[] = ['AWAITING_CLAIM', 'CLAIMED', 'AWAITING_REVIEW', 'WITH_SUPPORT'];
const SUPPORT_TABS: SupportQueueTab[] = ['AWAITING_SEND', 'RETURNED'];

type Job =
  | { kind: 'admin'; tab: AdminQueueTab; n: number }
  | { kind: 'support'; tab: SupportQueueTab; n: number }
  | { kind: 'menu'; code: MenuCode; n: number };

/**
 * ศูนย์รวมเลขบนเมนู sidebar + กระดิ่ง — refreshBadges() ที่เดียว
 * เลขแท็บในหน้าคิวอ่านจากชุดเดียวกันนี้ (adminTabCounts / supportTabCounts)
 * เรียกซ้ำติดกันรวมเป็นครั้งเดียว · ไม่ยิงซ้อน · poll 30 วิ เฉพาะตอนแท็บเปิดอยู่
 */
@Injectable({ providedIn: 'root' })
export class NavAttentionService {
  private readonly auth = inject(AuthService);
  private readonly tickets = inject(TicketService);
  private readonly projects = inject(ProjectService);
  private readonly inbox = inject(NotificationInboxService);
  private readonly router = inject(Router);

  private readonly adminTabsSignal = signal<Record<AdminQueueTab, number>>({
    AWAITING_CLAIM: 0,
    CLAIMED: 0,
    AWAITING_REVIEW: 0,
    WITH_SUPPORT: 0,
  });
  private readonly supportTabsSignal = signal<Record<SupportQueueTab, number>>({
    AWAITING_SEND: 0,
    RETURNED: 0,
  });
  private readonly taskCountsSignal = signal<Partial<Record<MenuCode, number>>>({});

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
    const next: Partial<Record<MenuCode, number>> = { ...this.taskCountsSignal() };
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
    this.adminTabsSignal.set({ AWAITING_CLAIM: 0, CLAIMED: 0, AWAITING_REVIEW: 0, WITH_SUPPORT: 0 });
    this.supportTabsSignal.set({ AWAITING_SEND: 0, RETURNED: 0 });
    this.taskCountsSignal.set({});
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

    const jobs: Observable<Job>[] = [];
    if (this.auth.canAccessTicketSupportQueue()) {
      for (const tab of SUPPORT_TABS) {
        jobs.push(
          this.tickets.listSupportQueue({ tab, page: 1, limit: 1 }).pipe(
            map((body): Job => ({ kind: 'support', tab, n: body.total })),
            catchError(() => of<Job>({ kind: 'support', tab, n: this.supportTabsSignal()[tab] }))
          )
        );
      }
    }
    if (this.auth.canAccessTicketAdminQueue()) {
      for (const tab of ADMIN_TABS) {
        jobs.push(
          this.tickets.listAdminQueue({ tab, page: 1, limit: 1 }).pipe(
            map((body): Job => ({ kind: 'admin', tab, n: body.total })),
            catchError(() => of<Job>({ kind: 'admin', tab, n: this.adminTabsSignal()[tab] }))
          )
        );
      }
    }
    if (this.auth.canAccessTaskReviewQueue()) {
      jobs.push(
        this.projects.listAllTasks({ page: 1, limit: 100, status: 'REVIEW' }).pipe(
          map((rows): Job => ({ kind: 'menu', code: 'tasks-review', n: rows.length })),
          catchError(() => of<Job>({ kind: 'menu', code: 'tasks-review', n: 0 }))
        )
      );
    }
    if (this.auth.hasPermissionCode('task.view')) {
      jobs.push(
        this.projects.listMyTasks({ limit: 100 }).pipe(
          map((rows): Job => {
            const n = rows.filter(
              (t) =>
                (t.status === 'DOING' || t.status === 'WAITING') &&
                (t.submissions ?? []).some((s) => String(s.status).toUpperCase() === 'REJECTED')
            ).length;
            return { kind: 'menu', code: 'tasks-me', n };
          }),
          catchError(() => of<Job>({ kind: 'menu', code: 'tasks-me', n: 0 }))
        )
      );
    }

    if (!jobs.length) {
      this.resetCounts();
      return;
    }

    this.inFlight = true;
    forkJoin(jobs).subscribe({
      next: (rows) => {
        const admin = { ...this.adminTabsSignal() };
        const support = { ...this.supportTabsSignal() };
        const tasks: Partial<Record<MenuCode, number>> = {};
        for (const row of rows) {
          if (row.kind === 'admin') {
            admin[row.tab] = row.n;
          } else if (row.kind === 'support') {
            support[row.tab] = row.n;
          } else if (row.n > 0) {
            tasks[row.code] = row.n;
          }
        }
        this.adminTabsSignal.set(admin);
        this.supportTabsSignal.set(support);
        this.taskCountsSignal.set(tasks);
        this.finishRun();
      },
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
