import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PageEvent } from '@angular/material/paginator';
import { debounceTime } from 'rxjs/operators';
import {
  REPORTED_CHANNEL_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  Ticket,
  TicketPriority,
} from '../../core/models/ticket.model';
import { AuthService } from '../../core/services/auth.service';
import {
  SupportQueueTab,
  TicketService,
} from '../../core/services/ticket.service';
import { UserService } from '../../core/services/user.service';
import { openConfirmDialog } from '../../shared/components/confirm-dialog.component';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { DEFAULT_PAGE_SIZE_OPTIONS } from '../../shared/utils/client-pager';
import { createTableSort } from '../../shared/utils/table-sort';

type SupportSortKey =
  | 'title'
  | 'project'
  | 'receiver'
  | 'queueAdmin'
  | 'assignee'
  | 'reportedAt'
  | 'status';

@Component({
  selector: 'app-support-queue-page',
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
  templateUrl: './support-queue-page.component.html',
  styleUrl: './support-queue-page.component.scss',
})
export class SupportQueuePageComponent implements OnInit {
  private readonly ticketsApi = inject(TicketService);
  private readonly usersApi = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  readonly tab = signal<SupportQueueTab>('AWAITING_SEND');
  readonly search = signal('');
  readonly searchControl = this.fb.nonNullable.control('');
  readonly items = signal<Ticket[]>([]);
  readonly total = signal(0);
  readonly sendTotal = signal(0);
  readonly returnedTotal = signal(0);
  readonly loading = signal(false);
  readonly actingId = signal<number | null>(null);
  readonly pageIndex = signal(0);
  readonly pageSize = signal(20);
  readonly pageSizeOptions = [...DEFAULT_PAGE_SIZE_OPTIONS];
  readonly tableSort = createTableSort<SupportSortKey>('reportedAt', 'desc');

  readonly canOpenAdminQueue = computed(() => {
    this.auth.session();
    return this.auth.canAccessTicketAdminQueue();
  });

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
  readonly channelLabels = REPORTED_CHANNEL_LABELS;

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
    this.searchControl.valueChanges.pipe(debounceTime(300)).subscribe((v) => {
      this.search.set(v);
      this.pageIndex.set(0);
      this.reload();
    });
    this.reload();
  }

  setTab(tab: SupportQueueTab): void {
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

  toggleSort(key: SupportSortKey): void {
    this.tableSort.toggleSort(key);
  }

  sortIcon(key: SupportSortKey): string {
    return this.tableSort.sortIcon(key);
  }

  projectLabel(row: Ticket): string {
    return row.project?.name?.trim() || '—';
  }

  reload(): void {
    this.loading.set(true);
    const tab = this.tab();
    this.ticketsApi
      .listSupportQueue({
        tab,
        page: this.pageIndex() + 1,
        limit: this.pageSize(),
        search: this.search().trim() || undefined,
      })
      .subscribe({
        next: (body) => {
          this.items.set(body.items);
          this.total.set(body.total);
          if (tab === 'AWAITING_SEND') {
            this.sendTotal.set(body.total);
          } else {
            this.returnedTotal.set(body.total);
          }
          this.loading.set(false);
          this.refreshOtherTabCount(tab);
        },
        error: (err: Error) => {
          this.items.set([]);
          this.total.set(0);
          this.loading.set(false);
          this.snack.open(err.message || 'โหลดคิวซัพพอร์ตไม่สำเร็จ', 'ปิด', {
            duration: 4500,
          });
        },
      });
  }

  private refreshOtherTabCount(active: SupportQueueTab): void {
    const other: SupportQueueTab =
      active === 'AWAITING_SEND' ? 'RETURNED' : 'AWAITING_SEND';
    this.ticketsApi
      .listSupportQueue({
        tab: other,
        page: 1,
        limit: 1,
        search: this.search().trim() || undefined,
      })
      .subscribe({
        next: (body) => {
          if (other === 'AWAITING_SEND') {
            this.sendTotal.set(body.total);
          } else {
            this.returnedTotal.set(body.total);
          }
        },
        error: () => {
          /* ignore */
        },
      });
  }

  userName(id: number | null | undefined): string {
    if (id == null) {
      return '—';
    }
    return this.usersApi.getById(id)?.fullName ?? `#${id}`;
  }

  priorityLabel(p: TicketPriority): string {
    return this.priorityLabels[p] ?? p;
  }

  statusLabel(row: Ticket): string {
    return this.statusLabels[row.status] ?? row.status;
  }

  sendToHead(row: Ticket): void {
    this.actingId.set(row.id);
    this.ticketsApi.sendToAdmin(row.id).subscribe({
      next: () => {
        this.actingId.set(null);
        this.snack.open('ส่งเข้าคิว「รอแอดมินรับเรื่อง」แล้ว', 'ปิด', {
          duration: 3000,
        });
        this.reload();
      },
      error: (err: Error) => {
        this.actingId.set(null);
        this.snack.open(err.message || 'ส่งหัวหน้าไม่สำเร็จ', 'ปิด', {
          duration: 5000,
        });
      },
    });
  }

  markNotified(row: Ticket): void {
    openConfirmDialog(this.dialog, {
      title: 'บอกลูกค้าแล้ว',
      message: `ยืนยันว่าได้แจ้งลูกค้าเรื่อง「${row.title}」แล้ว?\n\n(บันทึกในระบบเท่านั้น — ไม่ส่งหาลูกค้าจากแอป)`,
      confirmLabel: 'บอกลูกค้าแล้ว',
      cancelLabel: 'ยกเลิก',
      danger: false,
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.actingId.set(row.id);
      this.ticketsApi.customerNotified(row.id).subscribe({
        next: () => {
          this.actingId.set(null);
          this.snack.open('บันทึกว่าบอกลูกค้าแล้ว', 'ปิด', { duration: 3000 });
          this.reload();
        },
        error: (err: Error) => {
          this.actingId.set(null);
          this.snack.open(err.message || 'บันทึกไม่สำเร็จ', 'ปิด', {
            duration: 5000,
          });
        },
      });
    });
  }

  private sortValue(row: Ticket, key: SupportSortKey): string | number | null {
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
