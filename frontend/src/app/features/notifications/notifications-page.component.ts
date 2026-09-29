import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { map } from 'rxjs';
import {
  AppNotification,
  isNotificationUnread,
} from '../../core/models/notification.model';
import { AuthService } from '../../core/services/auth.service';
import { NotificationInboxService } from '../../core/services/notification-inbox.service';
import { NotificationService } from '../../core/services/notification.service';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { InfiniteScrollDirective } from '../../shared/directives/infinite-scroll.directive';
import { CursorFeed } from '../../shared/utils/cursor-feed';

type InboxFilter = 'ALL' | 'UNREAD' | 'READ';

const PAGE_SIZE = 30;

@Component({
  selector: 'app-notifications-page',
  standalone: true,
  imports: [
    ThaiDatePipe,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatTableModule,
    InfiniteScrollDirective,
  ],
  templateUrl: './notifications-page.component.html',
  styleUrl: './notifications-page.component.scss',
})
export class NotificationsPageComponent implements OnInit {
  private readonly api = inject(NotificationService);
  private readonly auth = inject(AuthService);
  private readonly inbox = inject(NotificationInboxService);
  private readonly snack = inject(MatSnackBar);

  readonly statusFilter = signal<InboxFilter>('ALL');

  /**
   * API กรองได้แค่ status=READ — แท็บ「ยังไม่อ่าน」ดึงทั้งหมดแล้วกรองฝั่ง FE
   * (หน้าที่กรองแล้วว่างจะโหลดต่อเองเพราะ sentinel ยังอยู่ในจอ)
   */
  readonly feed = new CursorFeed<AppNotification>((cursor) => {
    const filter = this.statusFilter();
    return this.api
      .listCursor({ limit: PAGE_SIZE, status: filter === 'READ' ? 'READ' : undefined }, cursor)
      .pipe(
        map((page) =>
          filter === 'UNREAD'
            ? { ...page, items: page.items.filter((row) => isNotificationUnread(row)) }
            : page
        )
      );
  });
  readonly items = this.feed.items;
  readonly loading = this.feed.loading;
  readonly markingId = signal<number | null>(null);
  readonly markingAll = signal(false);
  /** แท็บ「ยังไม่อ่าน」ใช้เลขจากกระดิ่ง — total ของ API นับรวมที่อ่านแล้ว */
  readonly total = computed(() =>
    this.statusFilter() === 'UNREAD' ? this.inbox.unreadCount() : this.feed.total()
  );
  /** นับจากกระดิ่ง + แถวบนหน้านี้ เผื่อกระดิ่งยังโหลดไม่เสร็จ */
  readonly hasUnread = computed(
    () => this.inbox.unreadCount() > 0 || this.items().some((row) => isNotificationUnread(row))
  );

  readonly columns = ['title'];

  readonly canView = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('notification.view');
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.feed.destroy());
  }

  ngOnInit(): void {
    this.reload();
  }

  setStatusFilter(value: InboxFilter): void {
    if (this.statusFilter() === value) {
      return;
    }
    this.statusFilter.set(value);
    this.reload();
  }

  reload(): void {
    if (!this.canView()) {
      return;
    }
    this.feed.reset();
  }

  loadMore(): void {
    this.feed.loadMore();
  }

  isUnread(row: AppNotification): boolean {
    return isNotificationUnread(row);
  }

  whenAt(row: AppNotification): string {
    return row.sentAt || row.createdAt;
  }

  messagePreview(row: AppNotification): string {
    return row.message?.trim() ?? '';
  }

  onRowClick(row: AppNotification): void {
    if (this.isUnread(row)) {
      this.applyRead(row.id);
    }
    this.inbox.openNotification(row);
  }

  /** PATCH /notifications/read-all — optimistic: ทุกแถวเป็นอ่านแล้วทันที · error คืนค่าเดิม */
  markAllRead(): void {
    if (this.markingAll()) {
      return;
    }
    const prev = this.items();
    const now = new Date().toISOString();
    if (this.statusFilter() === 'UNREAD') {
      this.feed.update(() => []);
    } else {
      this.feed.update((list) =>
        list.map((n) => (isNotificationUnread(n) ? { ...n, status: 'READ', readAt: now } : n))
      );
    }
    this.markingAll.set(true);
    this.inbox.markAllRead().subscribe({
      next: ({ updated }) => {
        this.markingAll.set(false);
        this.snack.open(
          updated > 0 ? `อ่านแล้ว ${updated} รายการ` : 'ไม่มีรายการที่ยังไม่อ่าน',
          'ปิด',
          { duration: 2500 }
        );
      },
      error: (err: Error) => {
        this.feed.update(() => prev);
        this.markingAll.set(false);
        this.snack.open(err.message || 'อ่านทั้งหมดไม่สำเร็จ', 'ปิด', { duration: 4000 });
      },
    });
  }

  /** optimistic: แถวเป็นอ่านแล้วทันที · error คืนแถวเดิม */
  markRead(row: AppNotification, event?: Event): void {
    event?.stopPropagation();
    if (!this.isUnread(row) || this.markingId() === row.id) {
      return;
    }
    const prev = this.items();
    this.applyRead(row.id);
    this.markingId.set(row.id);
    this.inbox.markRead(row).subscribe({
      next: (updated) => {
        if (this.statusFilter() !== 'UNREAD') {
          this.feed.update((list) => list.map((n) => (n.id === updated.id ? updated : n)));
        }
        this.markingId.set(null);
      },
      error: (err: Error) => {
        this.feed.update(() => prev);
        this.markingId.set(null);
        this.snack.open(err.message || 'ทำเครื่องหมายอ่านแล้วไม่สำเร็จ', 'ปิด', {
          duration: 4000,
        });
      },
    });
  }

  private applyRead(id: number): void {
    if (this.statusFilter() === 'UNREAD') {
      this.feed.update((list) => list.filter((n) => n.id !== id));
      return;
    }
    const now = new Date().toISOString();
    this.feed.update((list) =>
      list.map((n) => (n.id === id ? { ...n, status: 'READ', readAt: now } : n))
    );
  }
}
