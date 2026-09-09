import { DatePipe, Location } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  BILLING_TYPE_LABELS,
  BillingType,
  RESOLUTION_RESULT_LABELS,
  ResolutionResult,
  TICKET_STATUS_LABELS,
  Ticket,
  TicketResolution,
  TicketStatus,
} from '../../core/models/ticket.model';
import { AuthService } from '../../core/services/auth.service';
import { AuditService } from '../../core/services/audit.service';
import { CustomerService } from '../../core/services/customer.service';
import { ProjectService } from '../../core/services/project.service';
import { TicketService } from '../../core/services/ticket.service';
import { UserService } from '../../core/services/user.service';
import { navigateBack } from '../../core/utils/navigation.util';
import { BahtPipe } from '../../shared/pipes/baht.pipe';

@Component({
  selector: 'app-ticket-detail-page',
  standalone: true,
  imports: [
    BahtPipe,
    DatePipe,
    RouterLink,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
  ],
  templateUrl: './ticket-detail-page.component.html',
  styleUrl: './ticket-detail-page.component.scss',
})
export class TicketDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly ticketsApi = inject(TicketService);
  private readonly customersApi = inject(CustomerService);
  private readonly projectsApi = inject(ProjectService);
  private readonly usersApi = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly audit = inject(AuditService);
  private readonly fb = inject(FormBuilder);
  private readonly snack = inject(MatSnackBar);

  readonly ticket = signal<Ticket | null>(null);
  readonly resolutions = signal<TicketResolution[]>([]);
  readonly notFound = signal(false);
  readonly statusLabels = TICKET_STATUS_LABELS;
  readonly billingLabels = BILLING_TYPE_LABELS;
  readonly resultLabels = RESOLUTION_RESULT_LABELS;
  readonly results = Object.keys(RESOLUTION_RESULT_LABELS) as ResolutionResult[];
  readonly users = this.usersApi.users;

  private ticketId = 0;

  readonly resolutionForm = this.fb.nonNullable.group({
    rootCause: ['', Validators.required],
    actionTaken: ['', Validators.required],
    spentHour: [1, Validators.min(0)],
    result: ['SUCCESS' as ResolutionResult],
    resolvedByUserId: [0, Validators.min(1)],
  });

  goBack(): void {
    navigateBack(this.location, this.router, '/app/tickets');
  }

  ngOnInit(): void {
    this.ticketId = Number(this.route.snapshot.paramMap.get('id'));
    const ticket = this.ticketsApi.getById(this.ticketId);
    if (!ticket) {
      this.notFound.set(true);
      return;
    }
    this.ticket.set(ticket);
    const me = this.auth.currentUser();
    this.resolutionForm.patchValue({
      resolvedByUserId: me?.id ?? ticket.assigneeId ?? 0,
    });
    this.refresh();
  }

  refresh(): void {
    const ticket = this.ticketsApi.getById(this.ticketId);
    if (ticket) {
      this.ticket.set(ticket);
    }
    this.resolutions.set(this.ticketsApi.getResolutions(this.ticketId));
  }

  customerName(): string {
    const id = this.ticket()?.customerId;
    return id ? this.customersApi.getCustomer(id)?.name ?? `#${id}` : '—';
  }

  projectName(): string {
    const id = this.ticket()?.projectId;
    if (!id) {
      return '—';
    }
    const p = this.projectsApi.getProject(id);
    return p ? `${p.code} · ${p.name}` : `#${id}`;
  }

  userName(id: number | null): string {
    if (!id) {
      return '—';
    }
    return this.usersApi.getById(id)?.fullName ?? `#${id}`;
  }

  ticketStatusLabel(status: TicketStatus): string {
    return this.statusLabels[status];
  }

  billingLabel(type: BillingType): string {
    return this.billingLabels[type];
  }

  serviceHours(): string | null {
    const t = this.ticket();
    if (!t?.closedAt) {
      return null;
    }
    const ms = new Date(t.closedAt).getTime() - new Date(t.reportedAt).getTime();
    const hours = ms / 3600000;
    return `${hours.toFixed(1)} ชม.`;
  }

  addResolution(): void {
    if (this.resolutionForm.invalid) {
      this.resolutionForm.markAllAsTouched();
      return;
    }
    const raw = this.resolutionForm.getRawValue();
    this.ticketsApi
      .addResolution(this.ticketId, {
        rootCause: raw.rootCause,
        actionTaken: raw.actionTaken,
        spentHour: Number(raw.spentHour) || 0,
        result: raw.result,
        resolvedByUserId: Number(raw.resolvedByUserId),
      })
      .subscribe({
        next: () => {
          this.snack.open('บันทึกรอบการแก้ไขแล้ว', 'ปิด', { duration: 2500 });
          this.resolutionForm.patchValue({ rootCause: '', actionTaken: '', spentHour: 1 });
          this.refresh();
        },
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
      });
  }

  reopen(): void {
    this.ticketsApi.reopen(this.ticketId).subscribe({
      next: (ticket) => {
        const actor = this.auth.currentUser();
        this.audit.log({
          actorUserId: actor?.id ?? null,
          actorName: actor?.fullName ?? 'ระบบ',
          action: 'STATUS_CHANGE',
          entityType: 'ticket',
          entityId: ticket.id,
          summary: `ปัญหาเดิมกลับมา: ${ticket.ticketNo}`,
        });
        this.snack.open('เปิดปัญหาเดิมซ้ำแล้ว (ใบเดิม)', 'ปิด', { duration: 3000 });
        this.refresh();
      },
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
    });
  }

  closeTicket(): void {
    this.ticketsApi.updateStatus(this.ticketId, 'CLOSED').subscribe({
      next: () => {
        this.snack.open('ปิดงานแล้ว — จะหายจากหน้ารอรับแก้ไข', 'ปิด', { duration: 3000 });
        this.refresh();
      },
    });
  }

  startWork(): void {
    this.ticketsApi.updateStatus(this.ticketId, 'IN_PROGRESS').subscribe({
      next: () => {
        this.refresh();
      },
    });
  }
}
