import { Component, OnInit, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MENU_ITEMS } from '../nav/menu-items';
import { AuthService } from '../services/auth.service';
import { QuickActionsService } from '../services/quick-actions.service';

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
  ],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss',
})
export class MainLayoutComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly quickActions = inject(QuickActionsService);

  readonly user = this.auth.currentUser;

  /** ปุ่มลัดมุมขวาบน — ใช้ได้จากทุกหน้า ไม่ต้องเปลี่ยนเมนู */
  readonly canOpenTicket = computed(() => {
    this.auth.session();
    return this.quickActions.canOpenTicket();
  });

  readonly canLogCommunication = computed(() => {
    this.auth.session();
    return this.quickActions.canLogCommunication();
  });

  readonly roleSummary = computed(() => {
    const me = this.user();
    if (!me) {
      return '';
    }
    if (me.roles.length) {
      return me.roles.map((r) => r.name).join(', ');
    }
    return this.accountTypeLabel(me.accountType);
  });

  readonly visibleMenus = computed(() => {
    const codes = new Set(this.auth.getVisibleMenuCodes());
    return MENU_ITEMS.filter((item) => codes.has(item.code));
  });

  readonly menuGroups = computed(() => {
    const groups: { key: string; label: string; items: typeof MENU_ITEMS }[] = [
      { key: 'main', label: 'งานหลัก', items: [] },
      { key: 'support', label: 'ข้อมูล', items: [] },
      { key: 'settings', label: 'ตั้งค่า', items: [] },
    ];

    for (const item of this.visibleMenus()) {
      const group = groups.find((g) => g.key === item.group);
      group?.items.push(item);
    }

    return groups.filter((g) => g.items.length > 0);
  });

  ngOnInit(): void {
    this.auth.refreshSession();
  }

  /** + เปิดใบแจ้งปัญหา */
  openTicketForm(): void {
    this.quickActions.openTicketForm().subscribe();
  }

  /** + บันทึกการติดต่อ — พนักงานเพิ่งวางสายแล้วบันทึกได้ทันที */
  openCommunicationLog(): void {
    this.quickActions.openCommunicationLog().subscribe();
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
