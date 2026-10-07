import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PageEvent } from '@angular/material/paginator';
import { debounceTime } from 'rxjs/operators';
import {
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  Ticket,
  TicketPriority,
} from '../../core/models/ticket.model';
import {
  AdminQueueTab,
  TicketService,
} from '../../core/services/ticket.service';
import { AuthService } from '../../core/services/auth.service';
import { QuickActionsService } from '../../core/services/quick-actions.service';
import { UserService } from '../../core/services/user.service';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { ApiToastService } from '../../shared/services/api-toast.service';
import { DEFAULT_PAGE_SIZE_OPTIONS } from '../../shared/utils/client-pager';
import { FORM_DIALOG_COMPACT } from '../../shared/utils/form-dialog';
import { createTableSort } from '../../shared/utils/table-sort';
import { NavAttentionService } from '../../core/services/nav-attention.service';
import { TicketAssignDialogComponent } from './ticket-detail-page.component';
import {
  TicketReturnSupportDialogComponent,
  TicketReturnSupportDialogData,
  TicketReviewDialogResult,
} from './ticket-return-support-dialog.component';

/** REOPENED ไม่มีใน /tickets/admin-queue — ดึงจาก GET /tickets?status=REOPENED */
type AdminPageTab = AdminQueueTab | 'REOPENED';

const ADMIN_TABS: { id: AdminPageTab; label: string; alert?: boolean }[] = [
  { id: 'AWAITING_CLAIM', label: 'รอรับ', alert: true },
  { id: 'CLAIMED', label: 'ของฉัน', alert: true },
  { id: 'AWAITING_REVIEW', label: 'รอตรวจ', alert: true },
  { id: 'REOPENED', label: 'รอรับงานรอบใหม่', alert: true },
  { id: 'WITH_SUPPORT', label: 'ส่งซัพพอร์ตแล้ว' },
];

type AdminSortKey =
  | 'ticketNo'
  | 'title'
  | 'project'
  | 'receiver'
  | 'queueAdmin'
  | 'assignee'
  | 'reportedAt';

@Component({
  selector: 'app-admin-queue-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatSnackBarModule,
    MatTableModule,
    MatTooltipModule,
    ThaiDatePipe,
    TablePaginatorComponent,
  ],
  templateUrl: './admin-queue-page.component.html',
  styleUrl: './admin-queue-page.component.scss',
})
export class AdminQueuePageComponent implements OnInit {
  private readonly ticketsApi = inject(TicketService);
  private readonly usersApi = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly quickActions = inject(QuickActionsService);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ApiToastService);
  private readonly fb = inject(FormBuilder);
  private readonly attention = inject(NavAttentionService);

  private loadedOnce = false;

  readonly tabs = ADMIN_TABS;
  readonly tab = signal<AdminPageTab>('AWAITING_CLAIM');
  readonly search = signal('');
  readonly searchControl = this.fb.nonNullable.control('');
  readonly items = signal<Ticket[]>([]);
  readonly total = signal(0);
  readonly tabTotals = signal<Record<AdminPageTab, number>>({
    AWAITING_CLAIM: 0,
    CLAIMED: 0,
    AWAITING_REVIEW: 0,
    REOPENED: 0,
    WITH_SUPPORT: 0,
  });
  readonly loading = signal(false);
  readonly actingId = signal<number | null>(null);
  readonly pageIndex = signal(0);
  readonly pageSize = signal(20);
  readonly pageSizeOptions = [...DEFAULT_PAGE_SIZE_OPTIONS];

  readonly assignableUsers = this.usersApi.assignableTicket;
  readonly tableSort = createTableSort<AdminSortKey>('reportedAt', 'desc');

  readonly canOpenSupportQueue = computed(() => {
    this.auth.session();
    return this.auth.canAccessTicketSupportQueue();
  });

  readonly columns = [
    'ticketNo',
    'title',
    'project',
    'receiver',
    'queueAdmin',
    'assignee',
    'reportedAt',
    'actions',
  ];

  readonly statusLabels = TICKET_STATUS_LABELS;
  readonly priorityLabels = TICKET_PRIORITY_LABELS;

  readonly displayedItems = computed(() => {
    const rows = [...this.items()];
    const key = this.tableSort.sortKey();
    const dir = this.tableSort.sortDir();
    rows.sort((a, b) => {
      const cmp = this.tableSort.cmp(this.sortValue(a, key), this.sortValue(b, key));
      return dir === 'asc' ? cmp : -cmp;
    });
    return rows;
  });

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
    this.route.queryParamMap.subscribe((params) => {
      const tabParam = String(params.get('tab') ?? '').trim().toUpperCase();
      if (ADMIN_TABS.some((t) => t.id === tabParam) && this.tab() !== tabParam) {
        this.tab.set(tabParam as AdminPageTab);
        this.pageIndex.set(0);
        this.reload();
      }
    });

    // รายชื่อมอบหมาย = GET /users/assignable?capability=TICKET เท่านั้น (ห้าม fallback คนนอก)
    this.usersApi.listAssignable('TICKET').subscribe({
      error: (err: Error) => {
        this.toast.error(err, 'โหลดรายชื่อพนักงานไม่สำเร็จ');
      },
    });
    this.searchControl.valueChanges.pipe(debounceTime(300)).subscribe((v) => {
      this.search.set(v);
      this.pageIndex.set(0);
      this.reload();
    });
    this.reload();
  }

  setTab(tab: AdminPageTab): void {
    if (this.tab() === tab) {
      return;
    }
    this.tab.set(tab);
    this.pageIndex.set(0);
    this.reload();
  }

  onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.reload();
  }

  /** ไม่มีคำค้น = เลขชุดเดียวกับเมนู sidebar · มีคำค้น = นับตามคำค้น */
  tabCount(tab: AdminPageTab): number {
    if (tab !== 'REOPENED' && !this.search().trim()) {
      return this.attention.adminTabCounts()[tab] ?? 0;
    }
    return this.tabTotals()[tab] ?? 0;
  }

  toggleSort(key: AdminSortKey): void {
    this.tableSort.toggleSort(key);
  }

  sortIcon(key: AdminSortKey): string {
    return this.tableSort.sortIcon(key);
  }

  projectLabel(row: Ticket): string {
    return row.project?.name?.trim() || '—';
  }

  reload(): void {
    this.loading.set(true);
    const tab = this.tab();
    const search = this.search().trim() || undefined;
    const page = this.pageIndex() + 1;
    const limit = this.pageSize();
    const req =
      tab === 'REOPENED'
        ? this.ticketsApi.listPage({ status: 'REOPENED', page, limit, search })
        : this.ticketsApi.listAdminQueue({ tab, page, limit, search });
    req.subscribe({
        next: (body) => {
          this.items.set(body.items);
          this.total.set(body.total);
          this.tabTotals.update((m) => ({ ...m, [tab]: body.total }));
          this.loading.set(false);
          if (tab !== 'REOPENED') {
            this.refreshReopenedCount();
          }
          if (this.search().trim()) {
            this.refreshSiblingCounts(tab);
          } else if (tab !== 'REOPENED') {
            this.attention.setAdminTabCount(tab, body.total);
          }
        },
        error: (err: Error) => {
          this.items.set([]);
          this.total.set(0);
          this.loading.set(false);
          this.toast.error(err, 'โหลดคิวแอดมินไม่สำเร็จ');
        },
      });
  }

  private refreshReopenedCount(): void {
    this.ticketsApi
      .listPage({ status: 'REOPENED', page: 1, limit: 1, search: this.search().trim() || undefined })
      .subscribe({
        next: (body) => this.tabTotals.update((m) => ({ ...m, REOPENED: body.total })),
        error: () => {
          /* ignore */
        },
      });
  }

  private refreshSiblingCounts(active: AdminPageTab): void {
    for (const t of ADMIN_TABS) {
      if (t.id === active || t.id === 'REOPENED') {
        continue;
      }
      const id = t.id;
      this.ticketsApi
        .listAdminQueue({
          tab: id,
          page: 1,
          limit: 1,
          search: this.search().trim() || undefined,
        })
        .subscribe({
          next: (body) => {
            this.tabTotals.update((m) => ({ ...m, [t.id]: body.total }));
          },
          error: () => {
            /* ignore */
          },
        });
    }
  }

  userName(id: number | null | undefined): string {
    if (id == null) {
      return '—';
    }
    return this.usersApi.getById(id)?.fullName ?? `#${id}`;
  }

  /** คอลัมน์ผู้แก้ — ชื่อจาก API เท่านั้น */
  assigneeLabel(row: Ticket): string {
    return this.userName(row.assignedUserId);
  }

  priorityLabel(p: TicketPriority): string {
    return this.priorityLabels[p] ?? p;
  }

  statusLabel(row: Ticket): string {
    return this.statusLabels[row.status] ?? row.status;
  }

  claimTicket(row: Ticket): void {
    this.actingId.set(row.id);
    this.ticketsApi.claim(row.id).subscribe({
      next: (updated) => {
        this.actingId.set(null);
        const name = this.userName(updated.claimedByAdminUserId);
        this.toast.success(`รับคิวแล้ว · แอดมินผู้รับคิว = 「${name}」`);
        this.reload();
      },
      error: (err: Error) => {
        this.actingId.set(null);
        this.toast.error(err, 'รับเรื่องไม่สำเร็จ');
      },
    });
  }

  /** แท็บของฉัน — กดมอบหมายแล้วเลือกพนักงานใน dialog */
  openAssign(row: Ticket, reopened = false): void {
    const users = this.assignableUsers();
    if (!users.length) {
      this.toast.info('ยังไม่มีรายชื่อผู้รับผิดชอบ — โหลดหรือเพิ่มผู้ใช้ที่มีสิทธิ์รับใบก่อน');
      this.usersApi.listAssignable('TICKET').subscribe({
        error: (err: Error) => this.toast.error(err, 'โหลดรายชื่อพนักงานไม่สำเร็จ'),
      });
      return;
    }

    const ref = this.dialog.open(TicketAssignDialogComponent, {
      ...FORM_DIALOG_COMPACT,
      data: {
        users: users.map((u) => ({ id: u.id, fullName: u.fullName })),
        defaultUserId: reopened ? (row.assignedUserId ?? null) : null,
        title: reopened ? `รับงานรอบใหม่「${row.title}」` : `มอบหมาย「${row.title}」`,
      },
    });

    ref.afterClosed().subscribe((userId: number | null | undefined) => {
      if (userId == null || !Number.isFinite(userId) || userId < 1) {
        return;
      }
      const name =
        users.find((u) => u.id === userId)?.fullName ?? this.userName(userId);
      this.actingId.set(row.id);
      this.ticketsApi.assign(row.id, userId).subscribe({
        next: () => {
          this.actingId.set(null);
          this.toast.success(`มอบหมายให้「${name}」เรียบร้อย`);
          this.reload();
        },
        error: (err: Error) => {
          this.actingId.set(null);
          this.toast.error(err, 'มอบหมายไม่สำเร็จ');
        },
      });
    });
  }

  returnToSupport(row: Ticket): void {
    if (row.status !== 'RESOLVED') {
      this.toast.info(
        'ใบต้องเป็น「แก้ไขแล้ว」ก่อน — ให้พนักงานบันทึก resolution ให้จบ'
      );
      return;
    }
    this.dialog
      .open(TicketReturnSupportDialogComponent, {
        width: '680px',
        maxWidth: '96vw',
        autoFocus: false,
        data: {
          ticketId: row.id,
          ticketNo: row.ticketNo || `ใบ #${row.id}`,
          title: row.title,
          receiverName: this.userName(row.receivedByUserId),
          assigneeName: this.userName(row.assignedUserId),
        } satisfies TicketReturnSupportDialogData,
      })
      .afterClosed()
      .subscribe((result: TicketReviewDialogResult | undefined) => {
        if (!result) {
          return;
        }
        this.toast.success(
          result === 'approved' ? 'ส่งซัพพอร์ตแล้ว' : 'ส่งกลับให้ผู้แก้แล้ว — ใบกลับเป็นกำลังดำเนินการ'
        );
        this.reload();
      });
  }

  private sortValue(row: Ticket, key: AdminSortKey): string | number | null {
    switch (key) {
      case 'ticketNo':
        return row.ticketNo ?? '';
      case 'title':
        return row.title;
      case 'project':
        return row.project?.name ?? '';
      case 'receiver':
        return this.userName(row.receivedByUserId);
      case 'queueAdmin':
        return this.userName(row.claimedByAdminUserId);
      case 'assignee':
        return this.userName(row.assignedUserId);
      case 'reportedAt':
        return row.reportedAt;
      default:
        return null;
    }
  }
}
