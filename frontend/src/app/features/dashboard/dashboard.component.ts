import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MENU_ITEMS } from '../../core/nav/menu-items';
import { MenuItem } from '../../core/models/permission.model';
import { OPEN_PROJECT_STATUSES } from '../../core/models/project.model';
import { AuthService } from '../../core/services/auth.service';
import { CustomerService } from '../../core/services/customer.service';
import { FollowUpService } from '../../core/services/follow-up.service';
import { ProjectService } from '../../core/services/project.service';
import { TicketService } from '../../core/services/ticket.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, MatCardModule, MatButtonModule, MatIconModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly customers = inject(CustomerService);
  private readonly projects = inject(ProjectService);
  private readonly tickets = inject(TicketService);
  private readonly followUps = inject(FollowUpService);

  readonly user = this.auth.currentUser;
  readonly stats = signal([
    { label: 'ลูกค้า', value: '0', icon: 'business' },
    { label: 'โครงการเปิดอยู่', value: '0', icon: 'folder_special' },
    { label: 'ปัญหาค้าง', value: '0', icon: 'support_agent' },
    { label: 'ติดตามเลยกำหนด', value: '0', icon: 'event_available' },
  ]);

  readonly quickLinks = computed(() => {
    const codes = new Set(this.auth.getVisibleMenuCodes());
    return MENU_ITEMS.filter(
      (m: MenuItem) => codes.has(m.code) && m.code !== 'dashboard'
    ).slice(0, 6);
  });

  ngOnInit(): void {
    const openProjects = this.projects
      .projects()
      .filter((p) => OPEN_PROJECT_STATUSES.includes(p.status)).length;
    const setStats = (openTickets: number) => {
      this.stats.set([
        {
          label: 'ลูกค้า',
          value: String(this.customers.customers().length),
          icon: 'business',
        },
        {
          label: 'โครงการเปิดอยู่',
          value: String(openProjects),
          icon: 'folder_special',
        },
        {
          label: 'ปัญหาค้าง',
          value: String(openTickets),
          icon: 'support_agent',
        },
        {
          label: 'ติดตามเลยกำหนด',
          value: String(this.followUps.listOverdue().length),
          icon: 'event_available',
        },
      ]);
    };
    setStats(this.tickets.openQueue().length);
    this.tickets.listPending().subscribe({
      next: (rows) => setStats(rows.length),
      error: () => setStats(0),
    });
  }
}
