import { Location } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
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
import { openConfirmDialog } from '../../shared/components/confirm-dialog.component';
import { BahtPipe } from '../../shared/pipes/baht.pipe';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';

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
    MatSnackBarModule,
    MatTableModule,
    MatDialogModule,
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
  private readonly dialog = inject(MatDialog);

  readonly ticket = signal<Ticket | null>(null);
  readonly resolutions = signal<TicketResolution[]>([]);
  readonly resolutionSearch = signal('');
  readonly resolutionSearchControl = this.fb.nonNullable.control('');
  readonly notFound = signal(false);
  readonly loading = signal(true);
  readonly statusLabels = TICKET_STATUS_LABELS;
  readonly billingLabels = BILLING_TYPE_LABELS;
  readonly resultLabels = RESOLUTION_RESULT_LABELS;
  readonly users = this.usersApi.users;
  readonly canResolve = computed(() => this.auth.hasPermission('tickets', 'resolve'));
  readonly canAssign = computed(() => this.auth.hasPermissionCode('ticket.assign'));
  readonly canChangeResolver = this.auth.isAdminLevel();

  readonly resolutionColumns = [
    'rootCause',
    'detail',
    'result',
    'hoursSpent',
    'resolver',
    'resolvedAt',
    'actions',
  ];

  readonly filteredResolutions = computed(() => {
    const q = this.resolutionSearch().trim().toLowerCase();
    const list = this.resolutions();
    if (!q) {
      return list;
    }
    return list.filter((r) =>
      [
        r.rootCause,
        r.detail,
        this.resultLabels[r.result],
        String(r.hoursSpent ?? ''),
        this.userName(r.resolvedByUserId),
        r.resolvedAt,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  });

  private ticketId = 0;

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
    this.resolutionSearchControl.valueChanges.subscribe((v) => this.resolutionSearch.set(v));
    this.usersApi.loadForPicker(this.auth.currentUser()).subscribe();
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

  resultLabel(result: ResolutionResult): string {
    return this.resultLabels[result];
  }

  shortText(value: string | null | undefined, max = 60): string {
    const text = (value ?? '').trim();
    if (!text) {
      return '—';
    }
    return text.length > max ? `${text.slice(0, max)}…` : text;
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

  openAddResolution(): void {
    if (!this.canResolve()) {
      this.snack.open('ไม่มีสิทธิ์บันทึกรอบการแก้ไข', 'ปิด', { duration: 3000 });
      return;
    }
    const ref = this.dialog.open(TicketResolutionFormDialogComponent, {
      width: '560px',
      maxWidth: '95vw',
      data: {
        ticketId: this.ticketId,
        canChangeResolver: this.canChangeResolver,
        defaultResolverId:
          this.auth.currentUser()?.id ?? this.ticket()?.assignedUserId ?? 0,
      },
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.loadTicket();
      }
    });
  }

  openResolutionDetail(r: TicketResolution): void {
    openConfirmDialog(this.dialog, {
      title: `รอบแก้ไข · ${this.resultLabels[r.result]}`,
      message: [
        `สาเหตุ: ${r.rootCause || '—'}`,
        `วิธีแก้ไข: ${r.detail || '—'}`,
        `เวลาที่ใช้: ${r.hoursSpent ?? 0} ชม.`,
        `ผู้แก้ไข: ${this.userName(r.resolvedByUserId)}`,
        `วันเวลา: ${r.resolvedAt}`,
      ].join('\n'),
      confirmLabel: 'ปิด',
      hideCancel: true,
    }).subscribe();
  }

  reopen(): void {
    if (!this.canResolve()) {
      this.snack.open('ไม่มีสิทธิ์เปิดปัญหาเดิมซ้ำ', 'ปิด', { duration: 3000 });
      return;
    }
    this.ticketsApi.reopen(this.ticketId).subscribe({
      next: () => {
        this.snack.open('เปิดปัญหาเดิมซ้ำแล้ว (ใบเดิม)', 'ปิด', { duration: 3000 });
        this.loadTicket();
      },
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
    });
  }

  closeTicket(): void {
    if (!this.canResolve()) {
      this.snack.open('ไม่มีสิทธิ์ปิดงาน', 'ปิด', { duration: 3000 });
      return;
    }
    this.ticketsApi.close(this.ticketId).subscribe({
      next: () => {
        this.snack.open('ปิดงานแล้ว — จะหายจากหน้ารอรับแก้ไข', 'ปิด', { duration: 3000 });
        this.loadTicket();
      },
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
    });
  }

  startWork(): void {
    if (!this.canAssign()) {
      this.snack.open('ไม่มีสิทธิ์เริ่มดำเนินการ', 'ปิด', { duration: 3000 });
      return;
    }
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

/* ——— Add resolution dialog ——— */

export interface TicketResolutionFormData {
  ticketId: number;
  canChangeResolver: boolean;
  defaultResolverId: number;
}

@Component({
  selector: 'app-ticket-resolution-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>เพิ่มรอบการแก้ไข</h2>
    <mat-dialog-content>
      <p class="hint">ปัญหาเดิมกลับมาให้เพิ่มรอบในใบนี้ ไม่เปิดใบใหม่</p>
      <form [formGroup]="form" class="dlg-form" id="ticket-resolution-form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" class="full">
          <mat-label>สาเหตุ</mat-label>
          <textarea matInput rows="2" formControlName="rootCause"></textarea>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>วิธีแก้ไข</mat-label>
          <textarea matInput rows="2" formControlName="detail"></textarea>
        </mat-form-field>
        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>เวลาที่ใช้ (ชม.)</mat-label>
            <input matInput type="number" step="0.5" formControlName="hoursSpent" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>ผลลัพธ์</mat-label>
            <mat-select formControlName="result">
              @for (r of results; track r) {
                <mat-option [value]="r">{{ resultLabels[r] }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
        <mat-form-field appearance="outline" class="full">
          <mat-label>ผู้แก้ไข</mat-label>
          <mat-select formControlName="resolvedByUserId">
            @for (u of users(); track u.id) {
              <mat-option [value]="u.id">{{ u.fullName }}</mat-option>
            }
          </mat-select>
          @if (!data.canChangeResolver) {
            <mat-hint>ล็อกเป็นผู้ใช้ที่ล็อกอิน — เปลี่ยนได้เฉพาะ Admin</mat-hint>
          }
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button color="primary" type="submit" form="ticket-resolution-form">
        บันทึกรอบนี้
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .hint {
      margin: 0 0 0.75rem;
      color: #0f766e;
      font-size: 0.82rem;
    }
    .dlg-form {
      display: grid;
      gap: 0.35rem;
      min-width: min(480px, 80vw);
    }
    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.65rem;
    }
    .full {
      width: 100%;
    }
  `,
})
export class TicketResolutionFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly ticketsApi = inject(TicketService);
  private readonly usersApi = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject(MatDialogRef<TicketResolutionFormDialogComponent, boolean>);
  readonly data = inject<TicketResolutionFormData>(MAT_DIALOG_DATA);

  readonly users = this.usersApi.users;
  readonly resultLabels = RESOLUTION_RESULT_LABELS;
  readonly results = Object.keys(RESOLUTION_RESULT_LABELS) as ResolutionResult[];

  readonly form = this.fb.nonNullable.group({
    rootCause: [''],
    detail: ['', Validators.required],
    hoursSpent: [1, Validators.min(0)],
    result: ['SUCCESS' as ResolutionResult],
    resolvedByUserId: [
      {
        value: this.data.defaultResolverId || this.auth.currentUser()?.id || 0,
        disabled: !this.data.canChangeResolver,
      },
      Validators.min(1),
    ],
  });

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const me = this.auth.currentUser();
    const resolvedByUserId = this.data.canChangeResolver
      ? Number(raw.resolvedByUserId)
      : (me?.id ?? Number(raw.resolvedByUserId));

    this.ticketsApi
      .addResolution(this.data.ticketId, {
        rootCause: raw.rootCause.trim() || null,
        detail: raw.detail,
        hoursSpent: Number(raw.hoursSpent) || 0,
        result: raw.result,
        resolvedByUserId,
        resolvedAt: new Date().toISOString(),
      })
      .subscribe({
        next: ({ quota }) => {
          let msg = 'บันทึกรอบแล้ว';
          if (quota) {
            msg += ` · โควตา ${quota.periodStart}–${quota.periodEnd}: เหลือ ${quota.remaining}/${quota.quota}`;
            if (quota.isOverQuota) {
              msg += ' (เกินโควตา)';
            }
          }
          this.snack.open(msg, 'ปิด', { duration: quota?.isOverQuota ? 5000 : 2500 });
          this.ref.close(true);
        },
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
      });
  }
}
