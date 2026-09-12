import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { debounceTime } from 'rxjs/operators';
import {
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  Ticket,
  TicketPriority,
} from '../../core/models/ticket.model';
import { AuthService } from '../../core/services/auth.service';
import { CustomerService } from '../../core/services/customer.service';
import { ProjectService } from '../../core/services/project.service';
import { QuickActionsService } from '../../core/services/quick-actions.service';
import { TicketService } from '../../core/services/ticket.service';
import { openConfirmDialog } from '../../shared/components/confirm-dialog.component';
import { PICKER_DEBOUNCE_MS } from '../../shared/components/entity-picker.component';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { createClientPager } from '../../shared/utils/client-pager';
import { FORM_DIALOG } from '../../shared/utils/form-dialog';
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
    TablePaginatorComponent,
  ],
  templateUrl: './tickets-page.component.html',
  styleUrl: './tickets-page.component.scss',
})
export class TicketsPageComponent implements OnInit {
  private readonly ticketsApi = inject(TicketService);
  private readonly customersApi = inject(CustomerService);
  private readonly projectsApi = inject(ProjectService);
  private readonly quickActions = inject(QuickActionsService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);

  readonly tickets = signal<Ticket[]>([]);
  readonly loading = signal(false);
  /** ค่าเริ่มต้นคือ "รอรับการแก้ไข" — คิวที่ต้องทำวันนี้ */
  readonly view = signal<'open' | 'all'>('open');
  readonly search = signal('');
  readonly searchControl = this.fb.nonNullable.control('');

  readonly statusLabels = TICKET_STATUS_LABELS;
  readonly priorityLabels = TICKET_PRIORITY_LABELS;

  readonly canEdit = computed(() => {
    this.auth.session();
    return (
      this.auth.hasPermission('tickets', 'edit') ||
      this.auth.hasPermissionCode('ticket.update')
    );
  });
  readonly canDelete = computed(() => {
    // BE ยังไม่มี DELETE /api/tickets/:id ใน Swagger — ซ่อนกันกดแล้ว Cannot DELETE
    return false;
  });

  readonly columns = [
    'ticketNo',
    'title',
    'customer',
    'status',
    'priority',
    'reportedAt',
    'actions',
  ];

  readonly openCount = computed(
    () => this.tickets().filter((t) => this.isOpen(t)).length
  );

  readonly filtered = computed(() => {
    let list = this.tickets();
    if (this.view() === 'open') {
      list = list.filter((t) => this.isOpen(t));
    }

    const priorityRank: Record<TicketPriority, number> = {
      URGENT: 0,
      HIGH: 1,
      NORMAL: 2,
      LOW: 3,
    };
    return [...list].sort((a, b) => {
      const byPriority = priorityRank[a.priority] - priorityRank[b.priority];
      if (byPriority !== 0) {
        return byPriority;
      }
      return new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime();
    });
  });

  readonly pager = createClientPager(this.filtered);

  constructor() {
    // เปิดใบจากปุ่มลัดบนแถบบนขณะอยู่หน้านี้ — โหลดรายการใหม่ให้เห็นทันที
    effect(() => {
      this.quickActions.ticketCreated();
      if (this.loadedOnce) {
        this.reload();
      }
    });
  }

  private loadedOnce = false;

  ngOnInit(): void {
    this.loadedOnce = true;
    this.searchControl.valueChanges
      .pipe(debounceTime(PICKER_DEBOUNCE_MS))
      .subscribe((v) => {
        this.search.set(v);
        this.pager.reset();
        this.reload();
      });
    // เข้ามาจากการ์ด "ปัญหารอแก้" บนหน้าแรก
    if (this.route.snapshot.queryParamMap.get('view') === 'all') {
      this.view.set('all');
    }
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    const q = this.search().trim();
    const params =
      q.length >= 2 ? { search: q, limit: 100 } : { limit: 100 };
    this.ticketsApi.list(params).subscribe({
      next: (list) => {
        this.tickets.set(list);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.snack.open(err.message, 'ปิด', { duration: 4000 });
      },
    });
  }

  setView(view: 'open' | 'all'): void {
    this.view.set(view);
    this.pager.reset();
  }

  /** ใช้ flag จาก API ก่อนเสมอ — ห้ามคำนวณเองจากวันที่ */
  private isOpen(ticket: Ticket): boolean {
    return (
      ticket.isPending ||
      ['RECEIVED', 'IN_PROGRESS', 'REOPENED'].includes(ticket.status)
    );
  }

  customerName(row: Ticket): string {
    return (
      row.customer?.name ?? this.customersApi.getCustomer(row.customerId)?.name ?? '—'
    );
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

  statusLabel(status: Ticket['status']): string {
    return this.statusLabels[status] ?? status;
  }

  priorityLabel(priority: TicketPriority): string {
    return this.priorityLabels[priority] ?? priority;
  }

  openEdit(ticket: Ticket): void {
    if (!this.canEdit()) {
      this.snack.open('ไม่มีสิทธิ์แก้ไขใบแจ้งปัญหา', 'ปิด', { duration: 3000 });
      return;
    }
    this.dialog
      .open(TicketFormDialogComponent, {
        ...FORM_DIALOG,
        data: { ticket },
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.reload();
        }
      });
  }

  remove(row: Ticket): void {
    openConfirmDialog(this.dialog, {
      title: 'ลบใบแจ้งปัญหา',
      message: `ต้องการลบ「${row.title}」หรือไม่?`,
      confirmLabel: 'ลบ',
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.ticketsApi.remove(row.id).subscribe({
        next: () => {
          this.snack.open('ลบใบแจ้งปัญหาแล้ว', 'ปิด', { duration: 2500 });
          this.reload();
        },
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 4000 }),
      });
    });
  }
}
