import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDatepickerModule } from '@angular/material/datepicker';
import {
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
import {
  BILLING_TYPE_LABELS,
  BillingType,
  REPORTED_CHANNEL_LABELS,
  ReportedChannel,
  TICKET_STATUS_LABELS,
  Ticket,
  TicketPriority,
} from '../../core/models/ticket.model';
import { AuthService } from '../../core/services/auth.service';
import { CustomerService } from '../../core/services/customer.service';
import { MaService } from '../../core/services/ma.service';
import { ProjectService } from '../../core/services/project.service';
import { TicketInput, TicketService } from '../../core/services/ticket.service';
import { UserService } from '../../core/services/user.service';
import { combineDateAndTime, nowTimeString } from '../../core/utils/date.util';
import { switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-tickets-page',
  standalone: true,
  imports: [
    DatePipe,
    RouterLink,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatDialogModule,
    MatSnackBarModule,
  ],
  templateUrl: './tickets-page.component.html',
  styleUrl: './tickets-page.component.scss',
})
export class TicketsPageComponent implements OnInit {
  private readonly ticketsApi = inject(TicketService);
  private readonly customersApi = inject(CustomerService);
  private readonly dialog = inject(MatDialog);
  private readonly fb = inject(FormBuilder);

  readonly tickets = signal<Ticket[]>([]);
  readonly view = signal<'open' | 'all'>('all');
  readonly search = signal('');
  readonly searchControl = this.fb.nonNullable.control('');
  readonly statusLabels = TICKET_STATUS_LABELS;
  readonly columns = ['ticketNo', 'title', 'customer', 'status', 'priority', 'billing', 'reportedAt', 'actions'];

  readonly filtered = computed(() => {
    let list = this.tickets();
    if (this.view() === 'open') {
      list = list.filter((t) => ['RECEIVED', 'IN_PROGRESS', 'REOPENED'].includes(t.status));
    }
    const q = this.search().trim().toLowerCase();
    if (q) {
      list = list.filter((t) => {
        const customer = this.customerName(t.customerId).toLowerCase();
        return (
          t.ticketNo.toLowerCase().includes(q) ||
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          customer.includes(q) ||
          this.statusLabels[t.status].toLowerCase().includes(q) ||
          t.priority.toLowerCase().includes(q) ||
          BILLING_TYPE_LABELS[t.billingType].toLowerCase().includes(q)
        );
      });
    }
    const priorityRank: Record<TicketPriority, number> = {
      URGENT: 0,
      HIGH: 1,
      MEDIUM: 2,
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
    this.reload();
  }

  reload(): void {
    this.ticketsApi.list().subscribe((list) => this.tickets.set(list));
  }

  customerName(id: number): string {
    return this.customersApi.getCustomer(id)?.name ?? `#${id}`;
  }

  statusLabel(status: Ticket['status']): string {
    return this.statusLabels[status];
  }

  billingLabel(type: BillingType): string {
    return BILLING_TYPE_LABELS[type];
  }

  openCreate(): void {
    const ref = this.dialog.open(TicketFormDialogComponent, {
      width: '600px',
      maxWidth: '95vw',
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
  private readonly maApi = inject(MaService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject(MatDialogRef<TicketFormDialogComponent, boolean>);

  readonly customers = this.customersApi.customers;
  readonly users = this.usersApi.users;
  readonly projects = this.projectsApi.projects;
  readonly channelLabels = REPORTED_CHANNEL_LABELS;
  readonly channels = Object.keys(REPORTED_CHANNEL_LABELS) as ReportedChannel[];
  readonly billingLabels = BILLING_TYPE_LABELS;
  readonly billingTypes = Object.keys(BILLING_TYPE_LABELS) as BillingType[];
  readonly priorities: TicketPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.group({
    customerId: [0, Validators.min(1)],
    projectId: [null as number | null],
    title: ['', Validators.required],
    description: [''],
    category: [''],
    priority: ['MEDIUM' as TicketPriority],
    billingType: ['WARRANTY' as BillingType],
    chargeAmount: [0],
    reportedChannel: ['PHONE' as ReportedChannel],
    reportedDate: [new Date() as Date | null, Validators.required],
    reportedTime: [nowTimeString(), Validators.required],
    receivedByUserId: [0, Validators.min(1)],
    assigneeId: [null as number | null],
    attachmentName: [''],
  });

  constructor() {
    const me = this.auth.currentUser();
    const firstCustomer = this.customers()[0];
    this.form.patchValue({
      receivedByUserId: me?.id ?? 0,
      customerId: firstCustomer?.id ?? 0,
    });
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
    const payload: TicketInput = {
      customerId: Number(raw.customerId),
      projectId: raw.projectId,
      title: raw.title ?? '',
      description: raw.description ?? '',
      category: raw.category ?? '',
      priority: (raw.priority as TicketPriority) ?? 'MEDIUM',
      billingType: (raw.billingType as BillingType) ?? 'WARRANTY',
      chargeAmount: Number(raw.chargeAmount) || 0,
      reportedChannel: (raw.reportedChannel as ReportedChannel) ?? 'PHONE',
      reportedAt: combineDateAndTime(raw.reportedDate, raw.reportedTime),
      receivedByUserId: Number(raw.receivedByUserId),
      assigneeId: raw.assigneeId,
      attachmentName: (raw.attachmentName ?? '').trim() || null,
    };
    this.saving.set(true);
    this.error.set(null);

    const create$ =
      payload.billingType === 'QUOTA'
        ? this.maApi.consumeQuota(payload.customerId).pipe(
            switchMap(() => this.ticketsApi.create(payload))
          )
        : this.ticketsApi.create(payload);

    create$.subscribe({
      next: () => {
        this.saving.set(false);
        const msg =
          payload.billingType === 'QUOTA'
            ? 'เปิดปัญหาแล้ว และหักโควตา MA 1 เคส'
            : 'เปิดปัญหาแล้ว';
        this.snack.open(msg, 'ปิด', { duration: 2800 });
        this.ref.close(true);
      },
      error: (err: Error) => {
        this.saving.set(false);
        this.error.set(err.message);
      },
    });
  }
}
