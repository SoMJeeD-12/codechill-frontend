import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PageEvent } from '@angular/material/paginator';
import {
  AppNotification,
  NOTIFICATION_STATUSES,
  NotificationStatus,
  isNotificationUnread,
  notificationEventLabel,
  notificationRefLink,
  notificationStatusLabel,
} from '../../core/models/notification.model';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { DEFAULT_PAGE_SIZE_OPTIONS } from '../../shared/utils/client-pager';

type StatusFilter = 'ALL' | NotificationStatus;

@Component({
  selector: 'app-notifications-page',
  standalone: true,
  imports: [
    ThaiDatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatTableModule,
    MatTooltipModule,
    TablePaginatorComponent,
  ],
  templateUrl: './notifications-page.component.html',
  styleUrl: './notifications-page.component.scss',
})
export class NotificationsPageComponent implements OnInit {
  private readonly api = inject(NotificationService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);

  readonly items = signal<AppNotification[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly markingId = signal<number | null>(null);
  readonly statusFilter = signal<StatusFilter>('ALL');
  readonly pageIndex = signal(0);
  readonly pageSize = signal(20);
  readonly pageSizeOptions = [...DEFAULT_PAGE_SIZE_OPTIONS];

  readonly columns = ['title', 'eventType', 'status', 'when', 'actions'];
  readonly statuses = NOTIFICATION_STATUSES;

  readonly canView = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('notification.view');
  });

  ngOnInit(): void {
    this.reload();
  }

  setStatusFilter(value: StatusFilter): void {
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
    const status = this.statusFilter();
    this.api
      .list({
        page: this.pageIndex() + 1,
        limit: this.pageSize(),
        status: status === 'ALL' ? undefined : status,
      })
      .subscribe({
        next: (body) => {
          this.items.set(body.items);
          this.total.set(body.total);
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

  eventLabel(row: AppNotification): string {
    return notificationEventLabel(row.eventType);
  }

  statusLabel(row: AppNotification): string {
    return notificationStatusLabel(row.status);
  }

  statusFilterLabel(status: NotificationStatus): string {
    return notificationStatusLabel(status);
  }

  /** แสดง sentAt ถ้ามี ไม่เช่นนั้น createdAt */
  whenAt(row: AppNotification): string {
    return row.sentAt || row.createdAt;
  }

  messagePreview(row: AppNotification): string {
    const text = row.message?.trim() ?? '';
    if (!text) {
      return '';
    }
    return text.length > 120 ? `${text.slice(0, 120)}…` : text;
  }

  refLink(row: AppNotification): string[] | null {
    return notificationRefLink(row.refType, row.refId);
  }

  onRowClick(row: AppNotification): void {
    if (this.isUnread(row)) {
      this.markRead(row);
    }
  }

  markRead(row: AppNotification, event?: Event): void {
    event?.stopPropagation();
    if (!this.isUnread(row) || this.markingId() === row.id) {
      return;
    }
    this.markingId.set(row.id);
    this.api.markRead(row.id).subscribe({
      next: (updated) => {
        const filter = this.statusFilter();
        if (filter !== 'ALL' && filter !== 'READ' && updated.status === 'READ') {
          this.items.update((list) => list.filter((n) => n.id !== updated.id));
          this.total.update((t) => Math.max(0, t - 1));
        } else {
          this.items.update((list) =>
            list.map((n) => (n.id === updated.id ? updated : n))
          );
        }
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
