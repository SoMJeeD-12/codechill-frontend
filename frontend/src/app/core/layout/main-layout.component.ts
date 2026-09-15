import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { filter } from 'rxjs/operators';
import { MenuItem } from '../models/permission.model';
import { MENU_ITEMS } from '../nav/menu-items';
import { AuthService } from '../services/auth.service';
import { QuickActionsService } from '../services/quick-actions.service';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';

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
    HasPermissionDirective,
  ],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss',
})
export class MainLayoutComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly quickActions = inject(QuickActionsService);
  private readonly router = inject(Router);

  readonly user = this.auth.currentUser;
  /** เมนูที่มี children ที่กำลังขยาย */
  readonly expandedMenus = signal<Set<string>>(new Set(['tasks-me']));

  /** บันทึกการติดต่อ — สิทธิ์ create log หรืออัปเดตลูกค้า */
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
    return MENU_ITEMS.filter((item) => codes.has(item.code)).map((item) => ({
      ...item,
      children: item.children?.filter((child) => codes.has(child.code)) ?? [],
    }));
  });

  readonly menuGroups = computed(() => {
    const groups: { key: string; label: string; items: MenuItem[] }[] = [
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
    this.syncExpandedFromUrl(this.router.url);
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.syncExpandedFromUrl(e.urlAfterRedirects));
  }

  hasChildren(item: MenuItem): boolean {
    return (item.children?.length ?? 0) > 0;
  }

  isExpanded(code: string): boolean {
    return this.expandedMenus().has(code);
  }

  /** เทียบ route + query ให้เมนูย่อยไฮไลต์ถูกอัน */
  isNavActive(item: MenuItem): boolean {
    const tree = this.router.createUrlTree([item.route], {
      queryParams: item.queryParams ?? {},
    });
    return this.router.isActive(tree, {
      paths: 'exact',
      queryParams: item.queryParams ? 'exact' : 'exact',
      fragment: 'ignored',
      matrixParams: 'ignored',
    });
  }

  toggleExpand(code: string, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.expandedMenus.update((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  }

  /** ขยายกลุ่มเมื่ออยู่บนหน้างานของฉัน / เมนูย่อย */
  private syncExpandedFromUrl(url: string): void {
    const path = url.split('?')[0];
    for (const item of this.visibleMenus()) {
      if (!item.children?.length) {
        continue;
      }
      const onBranch =
        path === item.route ||
        path.startsWith(`${item.route}/`) ||
        item.children.some((c) => path === c.route || path.startsWith(`${c.route}/`));
      if (onBranch) {
        this.expandedMenus.update((prev) => {
          if (prev.has(item.code)) {
            return prev;
          }
          const next = new Set(prev);
          next.add(item.code);
          return next;
        });
      }
    }
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
