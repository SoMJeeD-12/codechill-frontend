import { Component, OnInit, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatBadgeModule } from '@angular/material/badge';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MENU_ITEMS } from '../nav/menu-items';
import { AuthService } from '../services/auth.service';
import { NotificationService } from '../services/notification.service';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatTooltipModule,
    MatBadgeModule,
  ],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss',
})
export class MainLayoutComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);

  readonly user = this.auth.currentUser;
  sidenavOpened = true;

  readonly unreadCount = computed(() => {
    const id = this.user()?.id;
    return id ? this.notifications.unreadCountFor(id) : 0;
  });

  readonly canSeeNotifications = computed(() =>
    this.auth.getVisibleMenuCodes().includes('notifications')
  );

  readonly visibleMenus = computed(() => {
    const codes = new Set(this.auth.getVisibleMenuCodes());
    return MENU_ITEMS.filter((item) => codes.has(item.code));
  });

  readonly menuGroups = computed(() => {
    const groups: { key: string; label: string; items: typeof MENU_ITEMS }[] = [
      { key: 'main', label: 'หลัก', items: [] },
      { key: 'ops', label: 'ปฏิบัติการ', items: [] },
      { key: 'revenue', label: 'รายได้ต่อเนื่อง', items: [] },
      { key: 'system', label: 'ระบบ', items: [] },
    ];

    for (const item of this.visibleMenus()) {
      const group = groups.find((g) => g.key === item.group);
      group?.items.push(item);
    }

    return groups.filter((g) => g.items.length > 0);
  });

  ngOnInit(): void {
    this.auth.refreshSession();
    const userId = this.auth.currentUser()?.id;
    if (userId) {
      this.notifications.ensureDemoSeed(userId).subscribe();
    }
  }
  accountTypeLabel(type: string | undefined): string {
    switch (type) {
      case 'SUPER_ADMIN':
        return 'Super Admin';
      case 'ADMIN':
        return 'Admin';
      default:
        return 'User';
    }
  }

  logout(): void {
    this.auth.logout();
  }
}
