import { Location } from '@angular/common';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
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
    ThaiDatePipe,
    BahtPipe,
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
  private readonly fb = inject(FormBuilder);
  private readonly snack = inject(MatSnackBar);

  readonly ticket = signal<Ticket | null>(null);
  readonly resolutions = signal<TicketResolution[]>([]);
  readonly notFound = signal(false);
  readonly loading = signal(true);
  readonly statusLabels = TICKET_STATUS_LABELS;
  readonly billingLabels = BILLING_TYPE_LABELS;
  readonly resultLabels = RESOLUTION_RESULT_LABELS;
  readonly results = Object.keys(RESOLUTION_RESULT_LABELS) as ResolutionResult[];
  readonly users = this.usersApi.users;

  private ticketId = 0;

  readonly resolutionForm = this.fb.nonNullable.group({
    rootCause: [''],
    detail: ['', Validators.required],
    hoursSpent: [1, Validators.min(0)],
    result: ['SUCCESS' as ResolutionResult],
    resolvedByUserId: [0, Validators.min(1)],
  });

  goBack(): void {
    navigateBack(this.location, this.router, '/app/tickets');
  }

  ngOnInit(): void {
    this.ticketId = Number(this.route.snapshot.paramMap.get('id'));
    if (!this.ticketId) {
      this.notFound.set(true);
      this.loading.set(false);
      return;
    }
    this.usersApi
      .loadForPicker(this.auth.currentUser())
      .subscribe();
    this.customersApi.listCustomers().subscribe({ error: () => undefined });
    this.projectsApi.listProjects().subscribe({ error: () => undefined });
    this.loadTicket();
  }

  loadTicket(): void {
    this.loading.set(true);
    this.ticketsApi.get(this.ticketId).subscribe({
      next: (ticket) => {
        this.ticket.set(ticket);
        this.resolutions.set(
          [...(ticket.resolutions ?? [])].sort((a, b) => a.round - b.round)
        );
        const me = this.auth.currentUser();
        this.resolutionForm.patchValue({
          resolvedByUserId: me?.id ?? ticket.assignedUserId ?? 0,
        });
        this.notFound.set(false);
        this.loading.set(false);
      },
      error: () => {
        this.notFound.set(true);
        this.loading.set(false);
      },
    });
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
        rootCause: raw.rootCause.trim() || null,
        detail: raw.detail,
        hoursSpent: Number(raw.hoursSpent) || 0,
        result: raw.result,
        resolvedByUserId: Number(raw.resolvedByUserId),
        resolvedAt: new Date().toISOString(),
      })
      .subscribe({
        next: ({ quota }) => {
          let msg = 'บันทึกรอบการแก้ไขแล้ว';
          if (quota) {
            msg += ` · โควตาเหลือ ${quota.remaining}/${quota.quota}`;
            if (quota.isOverQuota) {
              msg += ' (เกินโควตา)';
            }
          }
          this.snack.open(msg, 'ปิด', { duration: quota?.isOverQuota ? 5000 : 2500 });
          this.resolutionForm.patchValue({ rootCause: '', detail: '', hoursSpent: 1 });
          this.loadTicket();
        },
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
      });
  }

  reopen(): void {
    this.ticketsApi.reopen(this.ticketId).subscribe({
      next: () => {
        this.snack.open('เปิดปัญหาเดิมซ้ำแล้ว (ใบเดิม)', 'ปิด', { duration: 3000 });
        this.loadTicket();
      },
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
    });
  }

  closeTicket(): void {
    this.ticketsApi.close(this.ticketId).subscribe({
      next: () => {
        this.snack.open('ปิดงานแล้ว — จะหายจากหน้ารอรับแก้ไข', 'ปิด', { duration: 3000 });
        this.loadTicket();
      },
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
    });
  }

  /** ไม่มี endpoint เปลี่ยนสถานะตรง ๆ — ใช้มอบหมายผู้รับผิดชอบแทน */
  startWork(): void {
    const me = this.auth.currentUser();
    const current = this.ticket();
    const assignedUserId = current?.assignedUserId ?? me?.id ?? null;
    if (!assignedUserId) {
      this.snack.open('กรุณาเลือกผู้รับผิดชอบก่อนเริ่มงาน', 'ปิด', { duration: 3500 });
      return;
    }
    this.ticketsApi.assign(this.ticketId, assignedUserId).subscribe({
      next: () => {
        this.snack.open('มอบหมายและเริ่มดำเนินการแล้ว', 'ปิด', { duration: 2500 });
        this.loadTicket();
      },
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
    });
  }
}
