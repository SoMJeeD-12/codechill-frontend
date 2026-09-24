import { Component, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  AppNotification,
  isNotificationUnread,
  notificationRefLink,
} from '../models/notification.model';
import { AuthService } from '../services/auth.service';
import { NavAttentionService } from '../services/nav-attention.service';
import { NotificationService } from '../services/notification.service';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';

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
  ],
  templateUrl: './notification-bell.component.html',
  styleUrl: './notification-bell.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class NotificationBellComponent {
  private readonly auth = inject(AuthService);
  private readonly api = inject(NotificationService);
  private readonly attention = inject(NavAttentionService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly items = signal<AppNotification[]>([]);
  readonly markingId = signal<number | null>(null);

  readonly canView = computed(() => {
    this.auth.session();
    return this.auth.hasPermissionCode('notification.view');
  });

  /** จำนวนยังไม่อ่าน — จาก NavAttention (GET /notifications · ไม่ใช่ READ) */
  readonly unreadCount = computed(() => {
    this.attention.counts();
    return this.attention.badge('notifications');
  });

  readonly badgeText = computed(() => {
    const n = this.unreadCount();
    if (n <= 0) {
      return '';
    }
    return n > 99 ? '99+' : String(n);
  });

  onMenuOpened(): void {
    this.loadRecent();
  }

  loadRecent(): void {
    if (!this.canView()) {
      this.items.set([]);
      return;
    }
    this.loading.set(true);
    this.api.list({ page: 1, limit: 8 }).subscribe({
      next: (body) => {
        this.items.set(body.items);
        this.loading.set(false);
        this.attention.refresh();
      },
      error: () => {
        this.items.set([]);
        this.loading.set(false);
      },
    });
  }

  isUnread(row: AppNotification): boolean {
    return isNotificationUnread(row);
  }

  whenAt(row: AppNotification): string {
    return row.sentAt || row.createdAt;
  }

  openItem(row: AppNotification): void {
    const go = () => {
      const link = notificationRefLink(row.refType, row.refId);
      if (link) {
        void this.router.navigate(link);
      } else {
        void this.router.navigate(['/app/notifications']);
      }
    };

    if (!this.isUnread(row)) {
      go();
      return;
    }
    this.markingId.set(row.id);
    this.api.markRead(row.id).subscribe({
      next: (updated) => {
        this.items.update((list) =>
          list.map((n) => (n.id === updated.id ? updated : n))
        );
        this.markingId.set(null);
        this.attention.refresh();
        go();
      },
      error: () => {
        this.markingId.set(null);
        go();
      },
    });
  }
}
