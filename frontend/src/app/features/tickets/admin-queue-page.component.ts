import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
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
import { UserService } from '../../core/services/user.service';
import { openConfirmDialog } from '../../shared/components/confirm-dialog.component';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { DEFAULT_PAGE_SIZE_OPTIONS } from '../../shared/utils/client-pager';
import { createTableSort } from '../../shared/utils/table-sort';

const ADMIN_TABS: { id: AdminQueueTab; label: string }[] = [
  { id: 'AWAITING_CLAIM', label: 'รอแอดมินรับเรื่อง' },
  { id: 'CLAIMED', label: 'รอจัดแจง' },
  { id: 'AWAITING_REVIEW', label: 'รอส่งซัพพอร์ต' },
  { id: 'WITH_SUPPORT', label: 'อยู่กับซัพพอร์ต' },
];

type AdminSortKey =
  | 'title'
  | 'project'
  | 'receiver'
  | 'queueAdmin'
  | 'assignee'
  | 'reportedAt'
  | 'status';

@Component({
  selector: 'app-admin-queue-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
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
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  readonly tabs = ADMIN_TABS;
  readonly tab = signal<AdminQueueTab>('AWAITING_CLAIM');
  readonly search = signal('');
  readonly searchControl = this.fb.nonNullable.control('');
  readonly items = signal<Ticket[]>([]);
  readonly total = signal(0);
  readonly tabTotals = signal<Record<AdminQueueTab, number>>({
    AWAITING_CLAIM: 0,
    CLAIMED: 0,
    AWAITING_REVIEW: 0,
    WITH_SUPPORT: 0,
  });
  readonly loading = signal(false);
  readonly actingId = signal<number | null>(null);
  readonly assignPick = signal<Record<number, number>>({});
  readonly pageIndex = signal(0);
  readonly pageSize = signal(20);
  readonly pageSizeOptions = [...DEFAULT_PAGE_SIZE_OPTIONS];

  readonly assignableUsers = this.usersApi.assignableTicket;
  readonly tableSort = createTableSort<AdminSortKey>('reportedAt', 'desc');

  readonly columns = [
    'title',
    'project',
    'receiver',
    'queueAdmin',
    'assignee',
    'reportedAt',
    'status',
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

  ngOnInit(): void {
    // รายชื่อมอบหมาย = GET /users/assignable?capability=TICKET เท่านั้น (ห้าม fallback คนนอก)
    this.usersApi.listAssignable('TICKET').subscribe({
      error: (err: Error) => {
        this.snack.open(err.message || 'โหลดรายชื่อพนักงานไม่สำเร็จ', 'ปิด', {
          duration: 4500,
        });
      },
    });
    this.searchControl.valueChanges.pipe(debounceTime(300)).subscribe((v) => {
      this.search.set(v);
      this.pageIndex.set(0);
      this.reload();
    });
    this.reload();
  }

  setTab(tab: AdminQueueTab): void {
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

  tabCount(tab: AdminQueueTab): number {
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
    this.ticketsApi
      .listAdminQueue({
        tab,
        page: this.pageIndex() + 1,
        limit: this.pageSize(),
        search: this.search().trim() || undefined,
      })
      .subscribe({
        next: (body) => {
          this.items.set(body.items);
          this.total.set(body.total);
          this.tabTotals.update((m) => ({ ...m, [tab]: body.total }));
          this.loading.set(false);
          this.refreshSiblingCounts(tab);
        },
        error: (err: Error) => {
          this.items.set([]);
          this.total.set(0);
          this.loading.set(false);
          this.snack.open(err.message || 'โหลดคิวแอดมินไม่สำเร็จ', 'ปิด', {
            duration: 4500,
          });
        },
      });
  }

  private refreshSiblingCounts(active: AdminQueueTab): void {
    for (const t of ADMIN_TABS) {
      if (t.id === active) {
        continue;
      }
      this.ticketsApi
        .listAdminQueue({
          tab: t.id,
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

  setAssignPick(ticketId: number, userId: number | null | undefined): void {
    const id = Number(userId);
    if (!Number.isFinite(id) || id < 1) {
      return;
    }
    // เลือกอย่างเดียว ≠ มอบหมาย — เก็บ draft ในแถว ไม่แตะ assignedUserId
    this.assignPick.update((m) => ({ ...m, [ticketId]: id }));
  }

  /** มีการเลือกพนักงานในแถวนี้แล้วหรือยัง (ห้าม default คนแรก) */
  hasAssignPick(ticketId: number): boolean {
    return this.pickedAssigneeId(ticketId) != null;
  }

  /** draft ในแถว — ไม่ใช่ assignedUserId จาก API */
  pickedAssigneeId(ticketId: number): number | null {
    const id = this.assignPick()[ticketId];
    return typeof id === 'number' && id > 0 ? id : null;
  }

  claimTicket(row: Ticket): void {
    this.actingId.set(row.id);
    this.ticketsApi.claim(row.id).subscribe({
      next: (updated) => {
        this.actingId.set(null);
        const name = this.userName(updated.claimedByAdminUserId);
        this.snack.open(`รับคิวแล้ว · แอดมินผู้รับคิว = 「${name}」`, 'ปิด', {
          duration: 3200,
        });
        this.reload();
      },
      error: (err: Error) => {
        this.actingId.set(null);
        this.snack.open(err.message || 'รับเรื่องไม่สำเร็จ', 'ปิด', {
          duration: 5000,
        });
      },
    });
  }

  /** แท็บรอจัดแจง — กด「มอบหมาย」แล้วค่อย PATCH /tickets/:id/assign */
  assignTicket(row: Ticket, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    const assignedUserId = this.pickedAssigneeId(row.id);
    if (!assignedUserId) {
      this.snack.open('เลือกพนักงานก่อนมอบหมาย', 'ปิด', { duration: 3000 });
      return;
    }
    const name =
      this.assignableUsers().find((u) => u.id === assignedUserId)?.fullName ??
      this.userName(assignedUserId);
    this.actingId.set(row.id);
    this.ticketsApi.assign(row.id, assignedUserId).subscribe({
      next: () => {
        this.actingId.set(null);
        this.assignPick.update((m) => {
          const next = { ...m };
          delete next[row.id];
          return next;
        });
        this.snack.open(`มอบหมายให้「${name}」เรียบร้อย`, 'ปิด', { duration: 3200 });
        this.reload();
      },
      error: (err: Error) => {
        this.actingId.set(null);
        this.snack.open(err.message || 'มอบหมายไม่สำเร็จ', 'ปิด', {
          duration: 5000,
        });
      },
    });
  }

  returnToSupport(row: Ticket): void {
    if (row.status !== 'RESOLVED') {
      this.snack.open(
        'ใบต้องเป็น「แก้ไขแล้ว」ก่อน — ให้พนักงานบันทึก resolution ให้จบ',
        'ปิด',
        { duration: 4500 }
      );
      return;
    }
    openConfirmDialog(this.dialog, {
      title: 'ตรวจผ่าน · ส่งซัพพอร์ต',
      message: `ส่งใบ「${row.title}」กลับซัพพอร์ตให้บอกลูกค้า?\n\nสถานะปัจจุบัน: ${this.statusLabel(row)}`,
      confirmLabel: 'ตรวจผ่าน · ส่งซัพพอร์ต',
      cancelLabel: 'ยกเลิก',
      danger: false,
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.actingId.set(row.id);
      this.ticketsApi.returnToSupport(row.id).subscribe({
        next: () => {
          this.actingId.set(null);
          this.snack.open('ส่งซัพพอร์ตแล้ว', 'ปิด', { duration: 3000 });
          this.reload();
        },
        error: (err: Error) => {
          this.actingId.set(null);
          this.snack.open(err.message || 'ส่งซัพพอร์ตไม่สำเร็จ', 'ปิด', {
            duration: 5000,
          });
        },
      });
    });
  }

  private sortValue(row: Ticket, key: AdminSortKey): string | number | null {
    switch (key) {
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
      case 'status':
        return row.status;
      default:
        return null;
    }
  }
}
