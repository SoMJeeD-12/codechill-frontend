import { Location } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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
import { StatusBarComponent } from '../../shared/components/status-bar.component';
import { BahtPipe } from '../../shared/pipes/baht.pipe';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { createClientPager } from '../../shared/utils/client-pager';
import { FORM_DIALOG, FORM_DIALOG_COMPACT } from '../../shared/utils/form-dialog';
import { EMPTY, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-ticket-detail-page',
  standalone: true,
  imports: [
    ThaiDatePipe,
    BahtPipe,
    RouterLink,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatTableModule,
    MatDialogModule,
    StatusBarComponent,
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
  readonly canReopen = computed(() => this.auth.hasPermissionCode('ticket.reopen'));
  readonly canChangeResolver = this.auth.isAdminLevel();

  /** รอบถัดไปหลังเปิดกลับมา (resolutionCount เดิม + 1) */
  readonly nextRound = computed(() => (this.ticket()?.resolutionCount ?? 0) + 1);

  readonly resolutionColumns = [
    'round',
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

  readonly resolutionsPager = createClientPager(this.filteredResolutions);

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
          [...(ticket.resolutions ?? [])].sort((a, b) => b.round - a.round)
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

  /** ข้อความรองของแถบสถานะ */
  statusDetail(t: Ticket): string {
    const parts = [`แก้ไปแล้ว ${t.resolutionCount || 0} รอบ`];
    if (t.status === 'REOPENED') {
      parts.push(`พร้อมเริ่มรอบที่ ${this.nextRound()} — กด「รับงานรอบใหม่」เพื่อเริ่ม`);
    } else if (t.status === 'IN_PROGRESS' && (t.resolutionCount || 0) > 0) {
      parts.push(`กำลังทำรอบที่ ${this.nextRound()}`);
    }
    return parts.join(' · ');
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

  serviceHours(): string {
    const t = this.ticket();
    if (!t?.reportedAt) {
      return '—';
    }
    const start = new Date(t.reportedAt).getTime();
    if (Number.isNaN(start)) {
      return '—';
    }
    if (t.closedAt) {
      const end = new Date(t.closedAt).getTime();
      if (Number.isNaN(end)) {
        return '—';
      }
      const hours = Math.max(0, (end - start) / 3_600_000);
      return `${hours.toFixed(1)} ชม.`;
    }
    const hours = Math.max(0, (Date.now() - start) / 3_600_000);
    return `กำลังดำเนินการ (ผ่านมา ${hours.toFixed(1)} ชม.)`;
  }

  openAddResolution(): void {
    if (!this.canResolve()) {
      this.snack.open('ไม่มีสิทธิ์บันทึกรอบการแก้ไข', 'ปิด', { duration: 3000 });
      return;
    }
    const status = this.ticket()?.status;
    if (status === 'CLOSED') {
      this.snack.open(
        'ใบปิดงานแล้ว — กด「ปัญหาเดิมกลับมา」ก่อนจึงจะบันทึกรอบแก้ไขได้',
        'ปิด',
        { duration: 4500 }
      );
      return;
    }
    const ref = this.dialog.open(TicketResolutionFormDialogComponent, {
      ...FORM_DIALOG,
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
      title: `รอบที่ ${r.round}`,
      message: [
        `ผลลัพธ์: ${this.resultLabels[r.result]}`,
        `สาเหตุ: ${r.rootCause || '—'}`,
        `วิธีแก้ไข: ${r.detail || '—'}`,
        `ผู้แก้ไข: ${this.userName(r.resolvedByUserId)}`,
        // ยังไม่กรอก ≠ 0 ชั่วโมง
        `เวลาที่ใช้: ${r.hoursSpent != null ? r.hoursSpent + ' ชม.' : 'ยังไม่กรอก'}`,
        `เวลาที่แก้เสร็จ: ${r.resolvedAt || '—'}`,
      ].join('\n'),
      confirmLabel: 'ปิด',
      hideCancel: true,
    }).subscribe();
  }

  reopen(): void {
    this.openProblemReturned();
  }

  /** RESOLVED / CLOSED → reopen (+ assign ถ้ามีสิทธิ์) ในกล่องเดียว */
  openProblemReturned(): void {
    if (!this.canReopen()) {
      this.snack.open('ไม่มีสิทธิ์เปิดปัญหาเดิมกลับมา (ticket.reopen)', 'ปิด', {
        duration: 3500,
      });
      return;
    }
    const ticket = this.ticket();
    if (!ticket || (ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED')) {
      return;
    }
    const last = [...this.resolutions()].sort((a, b) => b.round - a.round)[0] ?? null;
    const ref = this.dialog.open(TicketProblemReturnedDialogComponent, {
      ...FORM_DIALOG,
      data: {
        ticketId: this.ticketId,
        ticket,
        /** อ่านก่อนเรียก reopen — หลัง reopen closedAt จะเป็น null */
        closedAtSnapshot: ticket.closedAt,
        lastResolution: last,
        users: this.users(),
        canAssign: this.canAssign(),
        defaultAssigneeId: ticket.assignedUserId,
      } satisfies TicketProblemReturnedDialogData,
    });
    ref.afterClosed().subscribe((ok) => {
      if (ok) {
        this.loadTicket();
      }
    });
  }

  closeTicket(): void {
    if (!this.canResolve()) {
      this.snack.open('ไม่มีสิทธิ์ปิดงาน', 'ปิด', { duration: 3000 });
      return;
    }
    const ticket = this.ticket();
    if (!ticket || ticket.status !== 'RESOLVED') {
      this.snack.open(
        'ปิดงานได้เมื่อสถานะเป็น「แก้ไขแล้ว」— ให้บันทึกการแก้ไขก่อน',
        'ปิด',
        { duration: 4000 }
      );
      return;
    }
    if ((ticket.resolutionCount ?? 0) < 1) {
      this.snack.open('ยังไม่มีรอบแก้ไข — บันทึกการแก้ไขก่อนปิดงาน', 'ปิด', {
        duration: 4000,
      });
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

  /** RECEIVED → มอบหมายแล้วเลื่อนเป็น IN_PROGRESS */
  assignWork(): void {
    this.pickAssigneeAndAssign('มอบหมายและเริ่มดำเนินการแล้ว');
  }

  /** REOPENED → รับงานรอบใหม่ (ส่งคนเดิมก็ได้) */
  pickupReopened(): void {
    this.pickAssigneeAndAssign('รับงานรอบใหม่แล้ว — สถานะเป็นกำลังดำเนินการ', true);
  }

  /** IN_PROGRESS → เปลี่ยนผู้รับผิดชอบ */
  changeAssignee(): void {
    this.pickAssigneeAndAssign('เปลี่ยนผู้รับผิดชอบแล้ว');
  }

  private pickAssigneeAndAssign(successMsg: string, preferCurrent = false): void {
    if (!this.canAssign()) {
      this.snack.open('ไม่มีสิทธิ์มอบหมายงาน', 'ปิด', { duration: 3000 });
      return;
    }
    const current = this.ticket();
    const me = this.auth.currentUser();
    const defaultId =
      (preferCurrent ? current?.assignedUserId : null) ??
      current?.assignedUserId ??
      me?.id ??
      null;

    const ref = this.dialog.open(TicketAssignDialogComponent, {
      ...FORM_DIALOG_COMPACT,
      data: {
        users: this.users(),
        defaultUserId: defaultId,
        title: preferCurrent ? 'รับงานรอบใหม่' : 'เลือกผู้รับผิดชอบ',
      },
    });
    ref.afterClosed().subscribe((userId: number | null | undefined) => {
      if (userId == null) {
        return;
      }
      this.ticketsApi.assign(this.ticketId, userId).subscribe({
        next: () => {
          this.snack.open(successMsg, 'ปิด', { duration: 2500 });
          this.loadTicket();
        },
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
      });
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
      min-width: min(720px, 92vw);
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

/* ——— Assign / pickup dialog ——— */

export interface TicketAssignDialogData {
  users: { id: number; fullName: string }[];
  defaultUserId: number | null;
  title: string;
}

@Component({
  selector: 'app-ticket-assign-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="ticket-assign-form" (ngSubmit)="confirm()">
        <mat-form-field appearance="outline" class="full">
          <mat-label>ผู้รับผิดชอบ</mat-label>
          <mat-select formControlName="assignedUserId">
            @for (u of data.users; track u.id) {
              <mat-option [value]="u.id">{{ u.fullName }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button color="primary" type="submit" form="ticket-assign-form">ยืนยัน</button>
    </mat-dialog-actions>
  `,
  styles: `
    .full {
      width: 100%;
      margin-top: 0.35rem;
    }
  `,
})
export class TicketAssignDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly ref = inject(MatDialogRef<TicketAssignDialogComponent, number | null>);
  readonly data = inject<TicketAssignDialogData>(MAT_DIALOG_DATA);

  readonly form = this.fb.nonNullable.group({
    assignedUserId: [this.data.defaultUserId ?? 0, Validators.min(1)],
  });

  confirm(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.ref.close(Number(this.form.getRawValue().assignedUserId));
  }
}

/* ——— ปัญหาเดิมกลับมา: reopen + assign ในครั้งเดียว ——— */

export interface TicketProblemReturnedDialogData {
  ticketId: number;
  ticket: Ticket;
  /** closedAt ณ ตอนเปิดกล่อง (ก่อนเรียก reopen) */
  closedAtSnapshot: string | null;
  lastResolution: TicketResolution | null;
  users: { id: number; fullName: string }[];
  canAssign: boolean;
  defaultAssigneeId: number | null;
}

@Component({
  selector: 'app-ticket-problem-returned-dialog',
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
    <h2 mat-dialog-title>ปัญหาเดิมกลับมา</h2>
    <mat-dialog-content>
      <p class="intro">เปิดรอบใหม่ในใบเดิม — ไม่สร้างใบใหม่ · ให้คนตัดสินว่าเป็นปัญหาเดิมจริง</p>

      @if (data.lastResolution; as last) {
        <div class="last-round">
          <strong>รอบล่าสุด (รอบที่ {{ last.round }})</strong>
          <p>สาเหตุ「{{ last.rootCause?.trim() || '—' }}」</p>
          <p>วิธีแก้「{{ last.detail.trim() || '—' }}」</p>
          <p class="tip">ดูวิธีแก้รอบก่อน เพื่อไม่แก้ด้วยวิธีเดิมซ้ำ</p>
        </div>
      } @else {
        <p class="muted">ยังไม่มีประวัติรอบแก้ไขในใบนี้</p>
      }

      @if (closedAgo(); as ago) {
        <p class="ago" [class.ago-warn]="ago.old">
          {{ ago.label }}
          @if (ago.old) {
            <span> — ปิดไปนานแล้ว ยืนยันว่าเป็นอาการเดิม?</span>
          }
        </p>
      }

      <form [formGroup]="form" id="ticket-reopen-form" class="dlg-form" (ngSubmit)="confirm()">
        <mat-form-field appearance="outline" class="full">
          <mat-label>อาการที่กลับมา</mat-label>
          <textarea
            matInput
            rows="3"
            formControlName="symptom"
            placeholder="อธิบายอาการที่กลับมาอีกครั้ง"
          ></textarea>
        </mat-form-field>
        @if (data.canAssign) {
          <mat-form-field appearance="outline" class="full">
            <mat-label>ผู้รับผิดชอบรอบนี้</mat-label>
            <mat-select formControlName="assignedUserId">
              @for (u of data.users; track u.id) {
                <mat-option [value]="u.id">{{ u.fullName }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        } @else {
          <p class="muted">
            ไม่มีสิทธิ์มอบหมาย — หลังเปิดจะเป็น「กลับมาเป็นซ้ำ」รอคนที่มีสิทธิ์กดรับงานรอบใหม่
          </p>
        }
      </form>
      @if (error()) {
        <p class="error">{{ error() }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close [disabled]="saving()">ยกเลิก</button>
      <button
        mat-flat-button
        color="primary"
        type="submit"
        form="ticket-reopen-form"
        [disabled]="saving()"
      >
        {{ saving() ? 'กำลังเปิด…' : 'เปิดรอบใหม่' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .intro {
      margin: 0 0 0.75rem;
      color: #5b6762;
      font-size: 0.86rem;
    }
    .last-round {
      margin: 0 0 0.75rem;
      padding: 0.75rem 0.85rem;
      border-radius: 10px;
      background: #f0f7f5;
      border: 1px solid #d5e8e2;
      font-size: 0.9rem;
    }
    .last-round strong {
      display: block;
      margin-bottom: 0.35rem;
    }
    .last-round p {
      margin: 0.2rem 0;
    }
    .tip {
      margin-top: 0.45rem !important;
      color: #0f766e;
      font-size: 0.8rem;
    }
    .ago {
      margin: 0 0 0.75rem;
      font-size: 0.88rem;
      color: #334155;
    }
    .ago-warn {
      color: #9a3412;
      font-weight: 500;
    }
    .muted {
      color: #64748b;
      font-size: 0.86rem;
      margin: 0 0 0.75rem;
      line-height: 1.4;
    }
    .dlg-form {
      display: grid;
      gap: 0.25rem;
      min-width: min(720px, 92vw);
    }
    .full {
      width: 100%;
    }
    .error {
      color: #991b1b;
      font-size: 0.86rem;
      margin: 0.35rem 0 0;
    }
  `,
})
export class TicketProblemReturnedDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly ticketsApi = inject(TicketService);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject(MatDialogRef<TicketProblemReturnedDialogComponent, boolean>);
  readonly data = inject<TicketProblemReturnedDialogData>(MAT_DIALOG_DATA);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.group({
    symptom: [''],
    assignedUserId: [
      this.data.canAssign
        ? (this.data.defaultAssigneeId ?? this.data.users[0]?.id ?? null)
        : null,
      this.data.canAssign ? [Validators.required, Validators.min(1)] : [],
    ],
  });

  closedAgo(): { label: string; old: boolean } | null {
    const closedAt = this.data.closedAtSnapshot;
    if (closedAt) {
      const days = Math.max(
        0,
        Math.floor((Date.now() - new Date(closedAt).getTime()) / 86_400_000)
      );
      const old = days > 90;
      if (days < 1) {
        return { label: 'ปิดงานไปเมื่อวันนี้', old: false };
      }
      if (days < 30) {
        return { label: `ปิดงานไปเมื่อ ${days} วันก่อน`, old };
      }
      const months = Math.floor(days / 30);
      if (months < 12) {
        return { label: `ปิดงานไปเมื่อ ${months} เดือนก่อน`, old };
      }
      return { label: `ปิดงานไปเมื่อ ${Math.floor(months / 12)} ปีก่อน`, old };
    }
    const resolvedAt = this.data.ticket.resolvedAt;
    if (!resolvedAt) {
      return null;
    }
    const days = Math.max(
      0,
      Math.floor((Date.now() - new Date(resolvedAt).getTime()) / 86_400_000)
    );
    if (days < 1) {
      return { label: 'แก้ไขแล้วเมื่อวันนี้', old: false };
    }
    if (days < 30) {
      return { label: `แก้ไขแล้วเมื่อ ${days} วันก่อน`, old: days > 90 };
    }
    const months = Math.floor(days / 30);
    return {
      label: `แก้ไขแล้วเมื่อ ${months < 12 ? months + ' เดือน' : Math.floor(months / 12) + ' ปี'}ก่อน`,
      old: days > 90,
    };
  }

  confirm(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const reason = (raw.symptom ?? '').trim() || null;
    const assigneeId = raw.assignedUserId ? Number(raw.assignedUserId) : null;

    this.saving.set(true);
    this.error.set(null);

    this.ticketsApi
      .reopen(this.data.ticketId, reason)
      .pipe(
        switchMap(() => {
          if (!this.data.canAssign || !assigneeId) {
            return of({ assigned: false as const });
          }
          return this.ticketsApi.assign(this.data.ticketId, assigneeId).pipe(
            switchMap(() => of({ assigned: true as const })),
            catchError((err: Error) => {
              this.saving.set(false);
              const msg = `เปิดใบกลับมาแล้ว แต่ยังมอบหมายผู้รับผิดชอบไม่สำเร็จ: ${err.message}`;
              this.error.set(msg);
              this.snack.open(msg, 'ปิด', { duration: 6500 });
              // ปิดกล่องแล้วรีเฟรช — ปุ่มรับงานรอบใหม่ต้องยังกดได้
              this.ref.close(true);
              return EMPTY;
            })
          );
        })
      )
      .subscribe({
        next: (result) => {
          this.saving.set(false);
          if (result.assigned) {
            this.snack.open(
              'เปิดรอบใหม่แล้ว — สถานะกำลังดำเนินการ พร้อมบันทึกรอบถัดไป',
              'ปิด',
              { duration: 3500 }
            );
          } else {
            this.snack.open(
              'เปิดเป็น「กลับมาเป็นซ้ำ」แล้ว — ให้ผู้มีสิทธิ์มอบหมายรับงานรอบใหม่',
              'ปิด',
              { duration: 4500 }
            );
          }
          this.ref.close(true);
        },
        error: (err: Error) => {
          this.saving.set(false);
          this.error.set(err.message);
        },
      });
  }
}
