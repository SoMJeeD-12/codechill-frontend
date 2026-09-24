import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { PageEvent } from '@angular/material/paginator';
import {
  AppNotification,
  isNotificationUnread,
} from '../../core/models/notification.model';
import { AuthService } from '../../core/services/auth.service';
import { NotificationInboxService } from '../../core/services/notification-inbox.service';
import { NotificationService } from '../../core/services/notification.service';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { DEFAULT_PAGE_SIZE_OPTIONS } from '../../shared/utils/client-pager';

type InboxFilter = 'ALL' | 'UNREAD' | 'READ';

@Component({
  selector: 'app-notifications-page',
  standalone: true,
  imports: [
    ThaiDatePipe,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatTableModule,
    TablePaginatorComponent,
  ],
  templateUrl: './notifications-page.component.html',
  styleUrl: './notifications-page.component.scss',
})
export class NotificationsPageComponent implements OnInit {
  private readonly api = inject(NotificationService);
  private readonly auth = inject(AuthService);
  private readonly inbox = inject(NotificationInboxService);
  private readonly snack = inject(MatSnackBar);

  readonly items = signal<AppNotification[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly markingId = signal<number | null>(null);
  readonly statusFilter = signal<InboxFilter>('ALL');
  readonly pageIndex = signal(0);
  readonly pageSize = signal(20);
  readonly pageSizeOptions = [...DEFAULT_PAGE_SIZE_OPTIONS];

  readonly columns = ['title'];

  readonly canView = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('notification.view');
  });

  ngOnInit(): void {
    this.reload();
  }

  setStatusFilter(value: InboxFilter): void {
    this.statusFilter.set(value);
    this.pageIndex.set(0);
    this.reload();
  }

  onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.reload();
  }

  reload(): void {
    if (!this.canView()) {
      this.items.set([]);
      this.total.set(0);
      return;
    }
    this.loading.set(true);
    const filter = this.statusFilter();
    const unreadMode = filter === 'UNREAD';
    this.api
      .list({
        page: unreadMode ? 1 : this.pageIndex() + 1,
        limit: unreadMode ? 50 : this.pageSize(),
        status: filter === 'READ' ? 'READ' : undefined,
      })
      .subscribe({
        next: (body) => {
          let rows = body.items ?? [];
          let total = body.total;
          if (unreadMode) {
            rows = rows.filter((row) => isNotificationUnread(row));
            total = rows.length;
            this.pageIndex.set(0);
          }
          this.items.set(rows);
          this.total.set(total);
          this.loading.set(false);
        },
        error: (err: Error) => {
          this.items.set([]);
          this.total.set(0);
          this.loading.set(false);
          this.snack.open(err.message || 'โหลดการแจ้งเตือนไม่สำเร็จ', 'ปิด', {
            duration: 4000,
          });
        },
      });
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
    this.markingId.set(row.id);
    this.inbox.openNotification(row);
    window.setTimeout(() => {
      this.markingId.set(null);
      this.reload();
      this.inbox.refreshQuiet();
    }, 600);
  }

  markRead(row: AppNotification, event?: Event): void {
    event?.stopPropagation();
    if (!this.isUnread(row) || this.markingId() === row.id) {
      return;
    }
    this.markingId.set(row.id);
    this.api.markRead(row.id).subscribe({
      next: (updated) => {
        if (this.statusFilter() === 'UNREAD') {
          this.items.update((list) => list.filter((n) => n.id !== updated.id));
          this.total.update((t) => Math.max(0, t - 1));
        } else {
          this.items.update((list) =>
            list.map((n) => (n.id === updated.id ? updated : n))
          );
        }
        this.inbox.refreshQuiet();
        this.markingId.set(null);
      },
      error: (err: Error) => {
        this.markingId.set(null);
        this.snack.open(err.message || 'ทำเครื่องหมายอ่านแล้วไม่สำเร็จ', 'ปิด', {
          duration: 4000,
        });
      },
    });
  }
}
