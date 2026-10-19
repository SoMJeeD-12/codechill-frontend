import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule } from '@angular/material/snack-bar';
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
  isTicketReopened,
} from '../../core/models/ticket.model';
import { AuthService } from '../../core/services/auth.service';
import { QuickActionsService } from '../../core/services/quick-actions.service';
import {
  SupportQueueTab,
  TicketService,
} from '../../core/services/ticket.service';
import { UserService } from '../../core/services/user.service';
import { openConfirmDialog } from '../../shared/components/confirm-dialog.component';
import { printCustomerNotice } from './ticket-customer-notice-print';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { ApiToastService } from '../../shared/services/api-toast.service';
import { DEFAULT_PAGE_SIZE_OPTIONS } from '../../shared/utils/client-pager';
import { createTableSort } from '../../shared/utils/table-sort';
import { NavAttentionService } from '../../core/services/nav-attention.service';

type SupportSortKey =
  | 'title'
  | 'project'
  | 'receiver'
  | 'queueAdmin'
  | 'assignee'
  | 'reportedAt';

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
  private readonly quickActions = inject(QuickActionsService);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ApiToastService);
  private readonly fb = inject(FormBuilder);
  private readonly attention = inject(NavAttentionService);

  private loadedOnce = false;

  /** ใบใหม่ส่งเข้าคิวแอดมินตั้งแต่ตอนเปิด — คิวซัพพอร์ตเหลือแค่ใบที่แอดมินส่งกลับมา */
  private readonly tab: SupportQueueTab = 'RETURNED';
  readonly search = signal('');
  readonly searchControl = this.fb.nonNullable.control('');
  readonly items = signal<Ticket[]>([]);
  readonly total = signal(0);
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
    'actions',
  ];

  readonly statusLabels = TICKET_STATUS_LABELS;
  readonly priorityLabels = TICKET_PRIORITY_LABELS;
  readonly channelLabels = REPORTED_CHANNEL_LABELS;

  constructor() {
    effect(() => {
      this.quickActions.ticketCreated();
      if (this.loadedOnce) {
        this.reload();
      }
    });
  }

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
    this.loadedOnce = true;
    this.searchControl.valueChanges.pipe(debounceTime(300)).subscribe((v) => {
      this.search.set(v);
      this.pageIndex.set(0);
      this.reload();
    });
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
    const tab = this.tab;
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
          this.loading.set(false);
          if (!this.search().trim()) {
            this.attention.setSupportTabCount(tab, body.total);
          }
        },
        error: (err: Error) => {
          this.items.set([]);
          this.total.set(0);
          this.loading.set(false);
          this.toast.error(err, 'โหลดคิวซัพพอร์ตไม่สำเร็จ');
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

  markNotified(row: Ticket): void {
    openConfirmDialog(this.dialog, {
      title: 'บอกลูกค้าแล้ว',
      icon: 'campaign',
      message: 'ยืนยันว่าได้แจ้งลูกค้าเรื่องนี้แล้ว',
      subject: row.title,
      note: 'บันทึกในระบบเท่านั้น ไม่ได้ส่งข้อความหาลูกค้าจากแอป พิมพ์ใบแจ้งได้ก่อน แล้วค่อยกดบอกลูกค้าแล้ว',
      confirmLabel: 'บอกลูกค้าแล้ว',
      cancelLabel: 'ยกเลิก',
      danger: false,
      extraLabel: 'พิมพ์ใบแจ้งลูกค้า',
      onExtra: () =>
        printCustomerNotice(this.ticketsApi, row.id, (message) =>
          this.toast.error(new Error(message), message)
        ),
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.actingId.set(row.id);
      this.ticketsApi.customerNotified(row.id).subscribe({
        next: () => {
          this.actingId.set(null);
          this.toast.success('บันทึกว่าบอกลูกค้าแล้ว');
          this.reload();
        },
        error: (err: Error) => {
          this.actingId.set(null);
          this.toast.error(err, 'บันทึกไม่สำเร็จ');
        },
      });
    });
  }

  readonly isReopened = isTicketReopened;

  /** ใบในคิวนี้แอดมินเพิ่งส่งกลับ — ใช้วันที่ของการแก้ล่าสุด (updatedAt) ไม่ใช้วันแจ้งครั้งแรก */
  queueDate(row: Ticket): string | null {
    return row.updatedAt || row.reportedAt || null;
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
        return this.queueDate(row);
      default:
        return null;
    }
  }
}
