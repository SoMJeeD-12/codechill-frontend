import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDatepickerModule } from '@angular/material/datepicker';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  BILLING_TYPE_LABELS,
  BillingType,
  REPORTED_CHANNEL_LABELS,
  ReportedChannel,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  Ticket,
  TicketPriority,
} from '../../core/models/ticket.model';
import { AuthService } from '../../core/services/auth.service';
import { CustomerService } from '../../core/services/customer.service';
import { ProjectService } from '../../core/services/project.service';
import {
  TicketCreateInput,
  TicketService,
  TicketUpdateInput,
} from '../../core/services/ticket.service';
import { UserService } from '../../core/services/user.service';
import {
  combineDateAndTime,
  nowTimeString,
  parseDateOnly,
  toTimeString,
} from '../../core/utils/date.util';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { ThaiTimeInputDirective } from '../../shared/directives/thai-time-input.directive';

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
  ],
  templateUrl: './tickets-page.component.html',
  styleUrl: './tickets-page.component.scss',
})
export class TicketsPageComponent implements OnInit {
  private readonly ticketsApi = inject(TicketService);
  private readonly customersApi = inject(CustomerService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  readonly tickets = signal<Ticket[]>([]);
  readonly view = signal<'open' | 'all'>('all');
  readonly search = signal('');
  readonly searchControl = this.fb.nonNullable.control('');
  readonly statusLabels = TICKET_STATUS_LABELS;
  readonly priorityLabels = TICKET_PRIORITY_LABELS;
  readonly canCreate = computed(() => this.auth.hasPermission('tickets', 'create'));
  readonly canEdit = computed(
    () =>
      this.auth.hasPermission('tickets', 'edit') ||
      this.auth.hasPermissionCode('ticket.update')
  );
  readonly columns = [
    'title',
    'customer',
    'status',
    'priority',
    'billing',
    'reportedAt',
    'actions',
  ];

  readonly filtered = computed(() => {
    let list = this.tickets();
    if (this.view() === 'open') {
      list = list.filter(
        (t) => t.isPending || ['RECEIVED', 'IN_PROGRESS', 'REOPENED'].includes(t.status)
      );
    }
    const q = this.search().trim().toLowerCase();
    if (q) {
      list = list.filter((t) => {
        const customer = this.customerName(t.customerId).toLowerCase();
        return (
          (t.ticketNo ?? '').toLowerCase().includes(q) ||
          t.title.toLowerCase().includes(q) ||
          (t.description ?? '').toLowerCase().includes(q) ||
          customer.includes(q) ||
          this.statusLabels[t.status].toLowerCase().includes(q) ||
          this.priorityLabels[t.priority].toLowerCase().includes(q) ||
          BILLING_TYPE_LABELS[t.billingType].toLowerCase().includes(q)
        );
      });
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

  ngOnInit(): void {
    this.searchControl.valueChanges.subscribe((v) => this.search.set(v));
    this.customersApi.listCustomers().subscribe({ error: () => undefined });
    this.reload();
  }

  reload(): void {
    this.ticketsApi.list().subscribe({
      next: (list) => this.tickets.set(list),
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
    });
  }

  customerName(id: number): string {
    return this.customersApi.getCustomer(id)?.name ?? `#${id}`;
  }

  statusLabel(status: Ticket['status']): string {
    return this.statusLabels[status];
  }

  priorityLabel(priority: TicketPriority): string {
    return this.priorityLabels[priority];
  }

  billingLabel(type: BillingType): string {
    return BILLING_TYPE_LABELS[type];
  }

  openCreate(): void {
    if (!this.canCreate()) {
      this.snack.open('ไม่มีสิทธิ์เปิดปัญหา', 'ปิด', { duration: 3000 });
      return;
    }
    this.openForm(null);
  }

  openEdit(ticket: Ticket): void {
    if (!this.canEdit()) {
      this.snack.open('ไม่มีสิทธิ์แก้ไขปัญหา', 'ปิด', { duration: 3000 });
      return;
    }
    this.openForm(ticket);
  }

  private openForm(ticket: Ticket | null): void {
    const ref = this.dialog.open(TicketFormDialogComponent, {
      width: '600px',
      maxWidth: '95vw',
      data: ticket,
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.reload();
      }
    });
  }
}

@Component({
  selector: 'app-ticket-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatSnackBarModule,
    MatDatepickerModule,
    ThaiTimeInputDirective,
  ],
  templateUrl: './ticket-form-dialog.component.html',
  styleUrl: './ticket-form-dialog.component.scss',
})
export class TicketFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly ticketsApi = inject(TicketService);
  private readonly customersApi = inject(CustomerService);
  private readonly projectsApi = inject(ProjectService);
  private readonly usersApi = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject(MatDialogRef<TicketFormDialogComponent, boolean>);
  readonly data = inject<Ticket | { customerId: number } | null>(MAT_DIALOG_DATA, {
    optional: true,
  }) ?? null;
  private readonly ticket: Ticket | null =
    this.data && typeof this.data === 'object' && 'ticketNo' in this.data
      ? (this.data as Ticket)
      : null;

  readonly customers = this.customersApi.customers;
  readonly users = this.usersApi.users;
  readonly projects = this.projectsApi.projects;
  readonly channelLabels = REPORTED_CHANNEL_LABELS;
  readonly channels = Object.keys(REPORTED_CHANNEL_LABELS) as ReportedChannel[];
  readonly billingLabels = BILLING_TYPE_LABELS;
  readonly billingTypes = Object.keys(BILLING_TYPE_LABELS) as BillingType[];
  readonly priorityLabels = TICKET_PRIORITY_LABELS;
  readonly priorities = Object.keys(TICKET_PRIORITY_LABELS) as TicketPriority[];
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly isEdit = !!this.ticket;
  /** ผู้รับเรื่อง — เปลี่ยนได้เฉพาะ ADMIN / SUPER_ADMIN */
  readonly canChangeReceiver = this.auth.isAdminLevel();
  /** ผู้รับผิดชอบ — ตามสิทธิ์ ticket.assign ในบทบาท */
  readonly canAssign = this.auth.hasPermissionCode('ticket.assign');

  readonly form = this.fb.group({
    customerId: [
      {
        value: this.ticket?.customerId ?? (this.data && 'customerId' in this.data ? this.data.customerId : 0),
        disabled: !!this.ticket,
      },
      Validators.min(1),
    ],
    projectId: [this.ticket?.projectId ?? (null as number | null)],
    title: [this.ticket?.title ?? '', Validators.required],
    description: [this.ticket?.description ?? ''],
    priority: [(this.ticket?.priority ?? 'NORMAL') as TicketPriority],
    billingType: [(this.ticket?.billingType ?? 'WARRANTY') as BillingType],
    reportedChannel: [(this.ticket?.reportedChannel ?? 'PHONE') as ReportedChannel],
    reportedDate: [
      (this.ticket ? parseDateOnly(this.ticket.reportedAt) : new Date()) as Date | null,
      Validators.required,
    ],
    reportedTime: [
      this.ticket ? toTimeString(this.ticket.reportedAt) : nowTimeString(),
      Validators.required,
    ],
    receivedByUserId: [
      {
        value: this.ticket?.receivedByUserId ?? (null as number | null),
        disabled: !this.auth.isAdminLevel(),
      },
    ],
    assignedUserId: [
      {
        value: this.ticket?.assignedUserId ?? (null as number | null),
        disabled: !this.auth.hasPermissionCode('ticket.assign'),
      },
    ],
  });

  constructor() {
    const me = this.auth.currentUser();
    if (!this.isEdit) {
      const preset =
        this.data && 'customerId' in this.data ? this.data.customerId : null;
      this.form.patchValue({
        receivedByUserId: me?.id ?? null,
        customerId: preset ?? this.customers()[0]?.id ?? 0,
      });
      if (preset) {
        this.form.controls.customerId.disable({ emitEvent: false });
      }
    } else {
      if (!this.canChangeReceiver) {
        this.form.get('receivedByUserId')?.disable({ emitEvent: false });
      }
      if (!this.canAssign) {
        this.form.get('assignedUserId')?.disable({ emitEvent: false });
      }
    }
    this.usersApi.loadForPicker(me).subscribe();
    if (!this.customers().length) {
      this.customersApi.listCustomers().subscribe();
    }
    if (!this.projects().length) {
      this.projectsApi.listProjects().subscribe();
    }
  }

  filteredProjects() {
    const customerId = this.form.getRawValue().customerId;
    return this.projects().filter((p) => p.customerId === customerId);
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const payload: TicketCreateInput = {
      customerId: Number(raw.customerId),
      projectId: raw.projectId,
      title: raw.title ?? '',
      description: (raw.description ?? '').trim() || null,
      priority: (raw.priority as TicketPriority) ?? 'NORMAL',
      billingType: (raw.billingType as BillingType) ?? 'WARRANTY',
      reportedChannel: (raw.reportedChannel as ReportedChannel) ?? 'PHONE',
      reportedAt: combineDateAndTime(raw.reportedDate, raw.reportedTime),
      receivedByUserId: raw.receivedByUserId ? Number(raw.receivedByUserId) : null,
      assignedUserId: raw.assignedUserId ? Number(raw.assignedUserId) : null,
    };
    this.saving.set(true);
    this.error.set(null);

    if (this.isEdit && this.ticket) {
      const update: TicketUpdateInput = {
        title: payload.title,
        description: payload.description,
        priority: payload.priority,
        billingType: payload.billingType,
        reportedChannel: payload.reportedChannel,
        reportedAt: payload.reportedAt,
        projectId: payload.projectId,
        receivedByUserId: payload.receivedByUserId,
        assignedUserId: payload.assignedUserId,
      };
      this.ticketsApi.update(this.ticket.id, update).subscribe({
        next: () => {
          this.saving.set(false);
          this.snack.open('แก้ไขปัญหาแล้ว', 'ปิด', { duration: 2800 });
          this.ref.close(true);
        },
        error: (err: Error) => {
          this.saving.set(false);
          this.error.set(err.message);
        },
      });
      return;
    }

    this.ticketsApi.create(payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.snack.open('เปิดปัญหาแล้ว', 'ปิด', { duration: 2800 });
        this.ref.close(true);
      },
      error: (err: Error) => {
        this.saving.set(false);
        this.error.set(err.message);
      },
    });
  }
}
