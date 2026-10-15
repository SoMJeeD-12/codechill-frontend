import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { map, switchMap } from 'rxjs/operators';
import {
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  Ticket,
  TicketPriority,
  TicketStatus,
  isTicketReopened,
  ticketQueueDate,
} from '../../core/models/ticket.model';
import { AuthService } from '../../core/services/auth.service';
import { CustomerService } from '../../core/services/customer.service';
import { ProjectService } from '../../core/services/project.service';
import { QuickActionsService } from '../../core/services/quick-actions.service';
import { TicketDemoOverlayService } from '../../core/services/ticket-demo-overlay.service';
import { TicketService } from '../../core/services/ticket.service';
import {
  ListLoadingBarComponent,
  ListSkeletonComponent,
} from '../../shared/components/list-loading.component';
import { RowAction, RowActionsComponent } from '../../shared/components/row-actions.component';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { FORM_DIALOG_WIDE } from '../../shared/utils/form-dialog';
import { createServerList } from '../../shared/utils/server-list';
import { TicketFormDialogComponent } from './ticket-form-dialog.component';

@Component({
  selector: 'app-tickets-page',
  standalone: true,
  imports: [
    ThaiDatePipe,
    RouterLink,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatDialogModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatMenuModule,
    RowActionsComponent,
    TablePaginatorComponent,
    ListLoadingBarComponent,
    ListSkeletonComponent,
  ],
  templateUrl: './tickets-page.component.html',
  styleUrl: './tickets-page.component.scss',
})
export class TicketsPageComponent implements OnInit {
  private readonly ticketsApi = inject(TicketService);
  private readonly customersApi = inject(CustomerService);
  private readonly projectsApi = inject(ProjectService);
  private readonly demoOverlay = inject(TicketDemoOverlayService);
  private readonly quickActions = inject(QuickActionsService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  /**
   * แบ่งหน้าฝั่ง server — มุมมอง「รอรับการแก้ไข」ใช้ GET /tickets/pending · 「ทั้งหมด」ใช้ GET /tickets
   * ค่าเริ่มต้นคือ "รอรับการแก้ไข" — คิวที่ต้องทำวันนี้
   */
  readonly list = createServerList<Ticket, { view: 'open' | 'all' }>({
    namespace: 'tickets',
    filters: { view: 'open' },
    sortBy: 'priority',
    sortOrder: 'DESC',
    sortOrderFor: (key) => (key === 'priority' || key === 'reportedAt' ? 'DESC' : 'ASC'),
    fetch: ({ filters, ...req }) =>
      (filters.view === 'open'
        ? this.ticketsApi.listPendingPage(req)
        : this.ticketsApi.listPage(req)
      ).pipe(
        switchMap((page) =>
          this.ticketsApi
            .enrichIncompleteWork(page.items)
            .pipe(map((items) => ({ items, total: page.total })))
        )
      ),
  });
  readonly loading = this.list.loading;
  readonly view = computed(() => this.list.filters().view);
  readonly searchControl = this.list.searchControl;
  /** เลขบนชิป「รอรับการแก้ไข」— total ของ /tickets/pending */
  private readonly pendingTotal = signal<number | null>(null);

  readonly statusLabels = TICKET_STATUS_LABELS;
  readonly priorityLabels = TICKET_PRIORITY_LABELS;

  readonly canEdit = computed(() => {
    this.auth.session();
    return (
      this.auth.hasPermission('tickets', 'edit') ||
      this.auth.hasPermissionCode('ticket.update')
    );
  });
  readonly canCreate = computed(() => {
    this.auth.session();
    return (
      this.auth.hasPermissionCode('ticket.create') ||
      this.auth.hasPermission('tickets', 'create')
    );
  });

  readonly columns = [
    'ticketNo',
    'priority',
    'title',
    'status',
    'customer',
    'reportedAt',
    'actions',
  ];

  readonly openCount = computed(() =>
    this.view() === 'open' && !this.list.initialLoading()
      ? this.list.total()
      : (this.pendingTotal() ?? 0)
  );

  constructor() {
    // เปิดใบจากปุ่มลัดบนแถบบนขณะอยู่หน้านี้ — โหลดรายการใหม่ให้เห็นทันที
    let lastCreated: unknown = undefined;
    let first = true;
    effect(() => {
      const created = this.quickActions.ticketCreated();
      if (first) {
        first = false;
        lastCreated = created;
        return;
      }
      if (created !== lastCreated) {
        lastCreated = created;
        untracked(() => this.reload());
      }
    });
  }

  openCreate(): void {
    this.quickActions.openTicketForm().subscribe();
  }

  ngOnInit(): void {
    this.list.start();
    this.loadPendingTotal();
  }

  reload(): void {
    this.list.reload({ invalidate: true });
    this.loadPendingTotal();
  }

  setView(view: 'open' | 'all'): void {
    this.list.setFilter('view', view);
  }

  toggleSort(key: string): void {
    this.list.toggleSort(key);
  }

  sortIcon(key: string): string {
    return this.list.sortIcon(key);
  }

  private loadPendingTotal(): void {
    this.ticketsApi.listPendingPage({ page: 1, limit: 1 }).subscribe({
      next: ({ total }) => this.pendingTotal.set(total),
      error: () => undefined,
    });
  }

  /** สถานะที่โชว์ในตาราง (รวมขั้น ASSIGNED + PARTIAL/FAILED ยังไม่จบ) */
  displayStatus(ticket: Ticket): TicketStatus {
    this.demoOverlay.state();
    return this.demoOverlay.effectiveStatus(ticket);
  }

  /** สถานะของใบจาก ticket.status — ไม่ใช่ผลของรอบแก้ (result) */
  statusLabelFor(ticket: Ticket): string {
    return this.statusLabels[ticket.status as TicketStatus] ?? ticket.status;
  }

  statusAttr(ticket: Ticket): string {
    return ticket.status;
  }

  customerName(row: Ticket): string {
    return (
      row.customer?.name ?? this.customersApi.getCustomer(row.customerId)?.name ?? '—'
    );
  }

  readonly isReopened = isTicketReopened;
  readonly rowDate = ticketQueueDate;

  ticketTitleTip(row: Ticket): string {
    const parts = [row.title];
    const project = this.projectName(row);
    if (project) {
      parts.push(project);
    }
    if (row.resolutionCount > 0) {
      parts.push(`แก้แล้ว ${row.resolutionCount} ครั้ง`);
    }
    return parts.join(' · ');
  }

  projectName(row: Ticket): string | null {
    if (row.project?.name) {
      return row.project.name;
    }
    if (row.projectId == null) {
      return null;
    }
    return this.projectsApi.getProject(row.projectId)?.name ?? null;
  }

  statusLabel(status: TicketStatus | Ticket['status']): string {
    return this.statusLabels[status as TicketStatus] ?? status;
  }

  priorityLabel(priority: TicketPriority): string {
    return this.priorityLabels[priority] ?? priority;
  }

  ticketRowActions(row: Ticket): RowAction[] {
    const actions: RowAction[] = [
      {
        label: 'เปิด',
        primary: true,
        icon: 'open_in_new',
        run: () => void this.router.navigate(['/app/tickets', row.id]),
      },
    ];
    if (this.canEdit()) {
      actions.push({ label: 'แก้ไข', icon: 'edit', run: () => this.openEdit(row) });
    }
    return actions;
  }

  openEdit(ticket: Ticket): void {
    if (!this.canEdit()) {
      this.snack.open('ไม่มีสิทธิ์แก้ไขใบแจ้งปัญหา', 'ปิด', { duration: 3000 });
      return;
    }
    this.dialog
      .open(TicketFormDialogComponent, {
        ...FORM_DIALOG_WIDE,
        data: { ticket },
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.reload();
        }
      });
  }
}
