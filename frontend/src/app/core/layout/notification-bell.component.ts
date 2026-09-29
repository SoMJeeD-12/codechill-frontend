import {
  Component,
  DestroyRef,
  ViewChild,
  ViewEncapsulation,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  AppNotification,
  isNotificationUnread,
} from '../models/notification.model';
import { AuthService } from '../services/auth.service';
import { NotificationInboxService } from '../services/notification-inbox.service';
import { NotificationService } from '../services/notification.service';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { InfiniteScrollDirective } from '../../shared/directives/infinite-scroll.directive';
import { CursorFeed } from '../../shared/utils/cursor-feed';

const MENU_PAGE_SIZE = 20;

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    ThaiDatePipe,
    InfiniteScrollDirective,
  ],
  templateUrl: './notification-bell.component.html',
  styleUrl: './notification-bell.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class NotificationBellComponent {
  private readonly auth = inject(AuthService);
  private readonly inbox = inject(NotificationInboxService);
  private readonly api = inject(NotificationService);
  private readonly snack = inject(MatSnackBar);

  @ViewChild(MatMenuTrigger) private menuTrigger?: MatMenuTrigger;

  readonly markingId = signal<number | null>(null);
  readonly markingAll = signal(false);

  readonly canView = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('notification.view');
  });

  readonly unreadCount = this.inbox.unreadCount;
  readonly ringing = this.inbox.ringing;

  /** รายการในเมนู — เลื่อนลงโหลดต่อด้วย cursor · ก่อนเปิดครั้งแรกใช้รายการล่าสุดจากรอบ poll */
  readonly feed = new CursorFeed<AppNotification>((cursor) =>
    this.api.listCursor({ limit: MENU_PAGE_SIZE }, cursor)
  );
  private readonly feedStarted = signal(false);
  readonly items = computed(() =>
    this.feedStarted() ? this.feed.items() : this.inbox.recentItems()
  );
  readonly loading = computed(() => this.feed.loading() && this.items().length === 0);

  readonly badgeText = computed(() => {
    const n = this.unreadCount();
    if (n <= 0) {
      return '';
    }
    return n > 99 ? '99+' : String(n);
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.feed.destroy());
  }

  onMenuOpened(): void {
    this.inbox.refreshQuiet();
    this.feed.reset({ keepRows: true });
    this.feedStarted.set(true);
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

  /** รายละเอียดจาก API — ว่าง/null ไม่โชว์ */
  messageText(row: AppNotification): string {
    return row.message?.trim() ?? '';
  }

  statusText(row: AppNotification): string {
    return this.isUnread(row) ? 'ยังไม่อ่าน' : 'อ่านแล้ว';
  }

  openItem(row: AppNotification): void {
    this.markingId.set(row.id);
    this.menuTrigger?.closeMenu();
    if (this.isUnread(row)) {
      const now = new Date().toISOString();
      this.feed.update((list) =>
        list.map((n) => (n.id === row.id ? { ...n, status: 'READ', readAt: now } : n))
      );
    }
    this.inbox.openNotification(row);
    window.setTimeout(() => this.markingId.set(null), 800);
  }

  markAllRead(): void {
    if (this.markingAll() || this.unreadCount() <= 0) {
      return;
    }
    const prev = this.feed.items();
    const now = new Date().toISOString();
    this.feed.update((list) =>
      list.map((n) => (isNotificationUnread(n) ? { ...n, status: 'READ', readAt: now } : n))
    );
    this.markingAll.set(true);
    this.inbox.markAllRead().subscribe({
      next: () => this.markingAll.set(false),
      error: (err: Error) => {
        this.feed.update(() => prev);
        this.markingAll.set(false);
        this.snack.open(err.message || 'อ่านทั้งหมดไม่สำเร็จ', 'ปิด', { duration: 3500 });
      },
    });
  }

  closeMenu(): void {
    this.menuTrigger?.closeMenu();
  }
}
