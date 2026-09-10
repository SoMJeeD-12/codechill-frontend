import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import {
  NOTIFICATION_CHANNEL_LABELS,
  NOTIFICATION_TRIGGER_LABELS,
  AppNotification,
  NotificationRule,
  NotificationTrigger,
} from '../../core/models/notification.model';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { UserService } from '../../core/services/user.service';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { createClientPager } from '../../shared/utils/client-pager';

@Component({
  selector: 'app-notifications-page',
  standalone: true,
  imports: [
    ThaiDatePipe,
        RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatTabsModule,
    MatButtonToggleModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    TablePaginatorComponent,
  ],
  templateUrl: './notifications-page.component.html',
  styleUrl: './notifications-page.component.scss',
})
export class NotificationsPageComponent implements OnInit {
  private readonly api = inject(NotificationService);
  private readonly auth = inject(AuthService);
  private readonly usersApi = inject(UserService);
  private readonly snack = inject(MatSnackBar);

  readonly rules = signal<NotificationRule[]>([]);
  readonly allItems = signal<AppNotification[]>([]);
  readonly inboxView = signal<'unread' | 'all'>('unread');
  readonly triggerLabels = NOTIFICATION_TRIGGER_LABELS;
  readonly channelLabels = NOTIFICATION_CHANNEL_LABELS;
  readonly ruleColumns = ['name', 'trigger', 'channel', 'days', 'enabled'];
  readonly itemColumns = ['title', 'user', 'trigger', 'createdAt', 'status', 'actions'];

  readonly inboxItems = computed(() => {
    const list = this.allItems();
    return this.inboxView() === 'unread' ? list.filter((n) => !n.readAt) : list;
  });

  readonly inboxPager = createClientPager(this.inboxItems);
  readonly rulesPager = createClientPager(this.rules);

  ngOnInit(): void {
    const user = this.auth.currentUser();
    this.api.ensureDemoSeed(user?.id ?? 0).subscribe({
      next: () => this.reload(),
      error: () => this.reload(),
    });
  }

  reload(): void {
    this.api.listRules().subscribe((list) => this.rules.set(list));
    const user = this.auth.currentUser();
    const isAdmin =
      user?.accountType === 'SUPER_ADMIN' || user?.accountType === 'ADMIN';
    const req = isAdmin ? this.api.listAll() : this.api.listForUser(user?.id ?? 0);
    req.subscribe((list) => this.allItems.set(list));
  }

  triggerLabel(t: NotificationTrigger): string {
    return this.triggerLabels[t];
  }

  channelLabel(rule: NotificationRule): string {
    return this.channelLabels[rule.channel];
  }

  userName(id: number): string {
    return this.usersApi.getById(id)?.fullName ?? `#${id}`;
  }

  toggleRule(rule: NotificationRule): void {
    const actor = this.auth.currentUser()?.fullName ?? 'ระบบ';
    this.api.toggleRule(rule.id, actor).subscribe({
      next: () => {
        this.snack.open(rule.enabled ? 'ปิดกติกาแล้ว' : 'เปิดกติกาแล้ว', 'ปิด', {
          duration: 2200,
        });
        this.reload();
      },
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
    });
  }

  markRead(row: AppNotification): void {
    this.api.markRead(row.id).subscribe({
      next: () => this.reload(),
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
    });
  }

  markAllRead(): void {
    const userId = this.auth.currentUser()?.id;
    if (!userId) {
      return;
    }
    this.api.markAllRead(userId).subscribe({
      next: (count) => {
        this.snack.open(count ? `อ่านแล้ว ${count} รายการ` : 'ไม่มีรายการค้าง', 'ปิด', {
          duration: 2500,
        });
        this.reload();
      },
    });
  }

  pushSample(): void {
    const userId = this.auth.currentUser()?.id;
    if (!userId) {
      return;
    }
    this.api
      .pushSample(
        userId,
        'แจ้งเตือนตัวอย่าง',
        'สร้างจากปุ่มทดสอบบนหน้าการแจ้งเตือน',
        'MANUAL',
        '/app/notifications'
      )
      .subscribe({
        next: () => {
          this.snack.open('สร้างแจ้งเตือนตัวอย่างแล้ว', 'ปิด', { duration: 2500 });
          this.inboxView.set('unread');
          this.reload();
        },
      });
  }
}
