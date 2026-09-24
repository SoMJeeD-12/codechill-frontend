import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { debounceTime } from 'rxjs/operators';
import {
  TICKET_STATUS_LABELS,
  Ticket,
  TicketStatus,
} from '../../core/models/ticket.model';
import { AuthService } from '../../core/services/auth.service';
import { QuickActionsService } from '../../core/services/quick-actions.service';
import { TicketService } from '../../core/services/ticket.service';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { ApiToastService } from '../../shared/services/api-toast.service';
import { createClientPager } from '../../shared/utils/client-pager';
import { createTableSort } from '../../shared/utils/table-sort';

type MineSortKey = 'ticketNo' | 'title' | 'project' | 'status' | 'reportedAt';

type MineTab = 'active' | 'all';

@Component({
  selector: 'app-my-tickets-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatTooltipModule,
    ThaiDatePipe,
    TablePaginatorComponent,
  ],
  templateUrl: './my-tickets-page.component.html',
  styleUrl: './my-tickets-page.component.scss',
})
export class MyTicketsPageComponent implements OnInit {
  private readonly ticketsApi = inject(TicketService);
  private readonly auth = inject(AuthService);
  private readonly quickActions = inject(QuickActionsService);
  private readonly toast = inject(ApiToastService);
  private readonly fb = inject(FormBuilder);

  private loadedOnce = false;

  readonly tab = signal<MineTab>('active');
  readonly search = signal('');
  readonly searchControl = this.fb.nonNullable.control('');
  readonly items = signal<Ticket[]>([]);
  readonly loading = signal(false);
  readonly actingId = signal<number | null>(null);
  readonly tableSort = createTableSort<MineSortKey>('reportedAt', 'desc');
  readonly statusLabels = TICKET_STATUS_LABELS;

  readonly columns = ['ticketNo', 'title', 'project', 'status', 'reportedAt', 'actions'];

  readonly myUserId = computed(() => this.auth.currentUser()?.id ?? null);

  readonly filtered = computed(() => {
    const me = this.myUserId();
    let rows = this.items().filter((t) => me != null && t.assignedUserId === me);
    if (this.tab() === 'active') {
      rows = rows.filter((t) => this.isActiveForMe(t));
    }
    const q = this.search().trim().toLowerCase();
    if (q) {
      rows = rows.filter((t) => {
        const blob = [
          t.ticketNo,
          t.title,
          t.customer?.name,
          t.project?.name,
          this.statusLabel(t),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return blob.includes(q);
      });
    }
    const key = this.tableSort.sortKey();
    const dir = this.tableSort.sortDir();
    return [...rows].sort((a, b) => {
      const cmp = this.tableSort.cmp(this.sortValue(a, key), this.sortValue(b, key));
      return dir === 'asc' ? cmp : -cmp;
    });
  });

  readonly activeCount = computed(
    () =>
      this.items().filter(
        (t) => t.assignedUserId === this.myUserId() && this.isActiveForMe(t)
      ).length
  );

  readonly pager = createClientPager(this.filtered);

  constructor() {
    effect(() => {
      this.quickActions.ticketCreated();
      if (this.loadedOnce) {
        this.reload();
      }
    });
  }

  ngOnInit(): void {
    this.loadedOnce = true;
    this.searchControl.valueChanges.pipe(debounceTime(300)).subscribe((v) => {
      this.search.set(v);
      this.pager.reset();
    });
    this.reload();
  }

  setTab(tab: MineTab): void {
    if (this.tab() === tab) {
      return;
    }
    this.tab.set(tab);
    this.pager.reset();
  }

  toggleSort(key: MineSortKey): void {
    this.tableSort.toggleSort(key);
    this.pager.reset();
  }

  sortIcon(key: MineSortKey): string {
    return this.tableSort.sortIcon(key);
  }

  projectLabel(row: Ticket): string {
    return row.project?.name?.trim() || '—';
  }

  statusLabel(row: Ticket): string {
    return this.statusLabels[row.status] ?? row.status;
  }

  canStart(row: Ticket): boolean {
    return row.status === 'ASSIGNED';
  }

  reload(): void {
    const me = this.myUserId();
    if (me == null) {
      this.items.set([]);
      return;
    }
    this.loading.set(true);
    this.ticketsApi.list({ assigneeId: me, limit: 100 }).subscribe({
      next: (list) => {
        this.items.set(list);
        this.loading.set(false);
        this.pager.reset();
      },
      error: (err: Error) => {
        this.items.set([]);
        this.loading.set(false);
        this.toast.error(err, 'โหลดใบของฉันไม่สำเร็จ');
      },
    });
  }

  startTicket(row: Ticket): void {
    if (!this.canStart(row)) {
      return;
    }
    this.actingId.set(row.id);
    this.ticketsApi.start(row.id).subscribe({
      next: () => {
        this.actingId.set(null);
        this.toast.success('เริ่มงานแล้ว');
        this.reload();
      },
      error: (err: Error) => {
        this.actingId.set(null);
        this.toast.error(err, 'เริ่มงานไม่สำเร็จ');
      },
    });
  }

  private isActiveForMe(t: Ticket): boolean {
    const active: TicketStatus[] = ['ASSIGNED', 'IN_PROGRESS', 'REOPENED'];
    return active.includes(t.status);
  }

  private sortValue(row: Ticket, key: MineSortKey): string | number | null {
    switch (key) {
      case 'ticketNo':
        return row.ticketNo ?? '';
      case 'title':
        return row.title;
      case 'project':
        return row.project?.name ?? '';
      case 'status':
        return row.status;
      case 'reportedAt':
        return row.reportedAt;
      default:
        return null;
    }
  }
}
