import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import {
  IsActiveMatchOptions,
  NavigationEnd,
  Params,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { filter } from 'rxjs/operators';
import { MenuItem } from '../models/permission.model';
import { MENU_ITEMS, MainMenuGroupKey, mainMenuOrder } from '../nav/menu-items';
import { AuthService } from '../services/auth.service';
import { QuickActionsService } from '../services/quick-actions.service';
import { NavAttentionService } from '../services/nav-attention.service';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';
import { NotificationBellComponent } from './notification-bell.component';
import { InboxToastHostComponent } from '../../shared/toasts/inbox-toast-host.component';
import { UserAvatarComponent } from '../../shared/components/user-avatar.component';

interface NavGroupNode {
  type: 'group';
  key: MainMenuGroupKey;
  label: string;
  icon: string;
  defaultExpanded: boolean;
  children: MenuItem[];
}

type NavNode = { type: 'item'; item: MenuItem } | NavGroupNode;

function navGroupStorageKey(userId: number): string {
  return `cpams.navGroups.${userId}`;
}

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
    NotificationBellComponent,
    InboxToastHostComponent,
    UserAvatarComponent,
  ],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss',
})
export class MainLayoutComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly quickActions = inject(QuickActionsService);
  private readonly router = inject(Router);
  /** จุดแดงเมนู — อ่าน counts() ใน template ให้ reactive */
  readonly attention = inject(NavAttentionService);
  readonly user = this.auth.currentUser;
  /** เมนูที่มี children ที่กำลังขยาย */
  readonly expandedMenus = signal<Set<string>>(new Set());

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
    this.auth.session();
    const codes = new Set(this.auth.getVisibleMenuCodes());
    return MENU_ITEMS.filter((item) => codes.has(item.code)).map((item) => ({
      ...item,
      children: item.children?.filter((child) => codes.has(child.code)) ?? [],
    }));
  });

  readonly menuGroups = computed(() => {
    this.auth.session();
    const visible = this.visibleMenus();
    const byGroup = (key: MenuItem['group']): NavNode[] =>
      visible.filter((item) => item.group === key).map((item) => ({ type: 'item', item }));

    const groups: { key: string; label: string; nodes: NavNode[] }[] = [
      { key: 'main', label: 'งานหลัก', nodes: this.buildMainNodes(visible) },
      { key: 'support', label: 'ข้อมูล', nodes: byGroup('support') },
      { key: 'settings', label: 'ตั้งค่า', nodes: byGroup('settings') },
    ];
    return groups.filter((g) => g.nodes.length > 0);
  });

  /** สถานะพับ/กางกลุ่มที่ผู้ใช้เลือก — ไม่มีค่า = ใช้ค่าเริ่มต้นของกลุ่ม */
  private readonly groupOpenState = signal<Partial<Record<MainMenuGroupKey, boolean>>>({});

  constructor() {
    effect(() => {
      const userId = this.user()?.id ?? null;
      untracked(() => {
        this.groupOpenState.set(this.readGroupState(userId));
        this.syncGroupFromUrl(this.router.url);
      });
    });
  }

  private buildMainNodes(visible: MenuItem[]): NavNode[] {
    const byCode = new Map(visible.filter((i) => i.group === 'main').map((i) => [i.code, i]));
    const used = new Set<string>();
    const nodes: NavNode[] = [];
    const structure = mainMenuOrder({
      hasAdminQueue: this.auth.canAccessTicketAdminQueue(),
      hasSupportQueue: this.auth.canAccessTicketSupportQueue(),
    });

    for (const entry of structure) {
      if (entry.kind === 'item') {
        const item = byCode.get(entry.code);
        if (item) {
          used.add(item.code);
          nodes.push({ type: 'item', item });
        }
        continue;
      }
      const children = entry.codes
        .map((code) => byCode.get(code))
        .filter((item): item is MenuItem => !!item);
      children.forEach((c) => used.add(c.code));
      if (children.length === 1) {
        nodes.push({ type: 'item', item: children[0] });
      } else if (children.length > 1) {
        nodes.push({
          type: 'group',
          key: entry.key,
          label: entry.label,
          icon: entry.icon,
          defaultExpanded: entry.defaultExpanded,
          children: children.map((c) => ({ ...c, label: entry.childLabels?.[c.code] ?? c.label })),
        });
      }
    }

    for (const item of byCode.values()) {
      if (!used.has(item.code)) {
        nodes.push({ type: 'item', item });
      }
    }
    return nodes;
  }

  isGroupOpen(node: NavGroupNode): boolean {
    return this.groupOpenState()[node.key] ?? node.defaultExpanded;
  }

  toggleGroup(node: NavGroupNode): void {
    this.setGroupOpen(node.key, !this.isGroupOpen(node));
  }

  groupBadge(node: NavGroupNode): number {
    return node.children.reduce((sum, c) => sum + this.badgeCount(c.code), 0);
  }

  private setGroupOpen(key: MainMenuGroupKey, open: boolean): void {
    if (this.groupOpenState()[key] === open) {
      return;
    }
    this.groupOpenState.update((prev) => ({ ...prev, [key]: open }));
    const userId = this.user()?.id;
    if (userId == null) {
      return;
    }
    try {
      localStorage.setItem(navGroupStorageKey(userId), JSON.stringify(this.groupOpenState()));
    } catch {
      // storage เต็ม / ถูกปิด — ใช้สถานะในหน่วยความจำต่อ
    }
  }

  private readGroupState(userId: number | null): Partial<Record<MainMenuGroupKey, boolean>> {
    if (userId == null) {
      return {};
    }
    try {
      const raw = localStorage.getItem(navGroupStorageKey(userId));
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  /** กางกลุ่มที่ route ปัจจุบันอยู่ — เลือกเมนูที่ route ตรงยาวที่สุด (กัน /app/tickets ทับ /app/tickets/mine) */
  private syncGroupFromUrl(url: string): void {
    const path = url.split('?')[0];
    const main = this.menuGroups().find((g) => g.key === 'main');
    let best: { len: number; group: NavGroupNode | null } | null = null;
    for (const node of main?.nodes ?? []) {
      const items = node.type === 'group' ? node.children : [node.item];
      for (const item of items) {
        if (path === item.route || path.startsWith(`${item.route}/`)) {
          if (!best || item.route.length > best.len) {
            best = { len: item.route.length, group: node.type === 'group' ? node : null };
          }
        }
      }
    }
    if (best?.group) {
      this.setGroupOpen(best.group.key, true);
    }
  }

  ngOnInit(): void {
    this.auth.refreshSession();
    this.syncExpandedFromUrl(this.router.url);
    this.attention.start();
    // รอ /auth/me เสร็จแล้วดึง badge / เริ่ม inbox อีกรอบ
    window.setTimeout(() => this.attention.start(), 1200);
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.syncExpandedFromUrl(e.urlAfterRedirects));
  }

  ngOnDestroy(): void {
    this.attention.stop();
  }

  badgeCount(code: string): number {
    // อ่าน signal ผ่าน counts() ให้ template re-render เมื่ออัปเดต
    this.attention.counts();
    return this.attention.badge(code as MenuItem['code']);
  }

  /** ลิงก์เมนูอาจพ่วง query ตาม badge — ไฮไลต์ตาม path อย่างเดียว */
  readonly navActiveOptions: IsActiveMatchOptions = {
    paths: 'subset',
    queryParams: 'ignored',
    matrixParams: 'ignored',
    fragment: 'ignored',
  };

  badgeQuery(code: string): Params | null {
    this.attention.counts();
    return this.attention.badgeQuery(code as MenuItem['code']);
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
    this.syncGroupFromUrl(url);
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
    this.quickActions.openTicketForm().subscribe((saved) => {
      if (saved) {
        this.attention.refreshBadges();
      }
    });
  }

  /** + บันทึกการติดต่อ — พนักงานเพิ่งวางสายแล้วบันทึกได้ทันที */
  openCommunicationLog(): void {
    this.quickActions.openCommunicationLog().subscribe((saved) => {
      if (saved) {
        this.attention.refreshBadges();
      }
    });
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
    this.attention.stop();
    this.auth.logout();
  }
}
