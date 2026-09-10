import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
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
import {
  FOLLOW_UP_STATUS_LABELS,
  FollowUp,
  FollowUpWritableStatus,
  followUpDisplayStatus,
} from '../../core/models/follow-up.model';
import {
  CHANNEL_LABELS,
  CommunicationChannel,
} from '../../core/models/customer.model';
import { AuthService } from '../../core/services/auth.service';
import { CustomerService } from '../../core/services/customer.service';
import {
  FollowUpCreateInput,
  FollowUpService,
  FollowUpUpdateInput,
} from '../../core/services/follow-up.service';
import { UserService } from '../../core/services/user.service';
import { parseDateOnly, toDateOnlyString } from '../../core/utils/date.util';
import { openConfirmDialog } from '../../shared/components/confirm-dialog.component';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { createClientPager } from '../../shared/utils/client-pager';

@Component({
  selector: 'app-follow-ups-page',
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
    TablePaginatorComponent,
  ],
  templateUrl: './follow-ups-page.component.html',
  styleUrl: './follow-ups-page.component.scss',
})
export class FollowUpsPageComponent implements OnInit {
  readonly api = inject(FollowUpService);
  private readonly customersApi = inject(CustomerService);
  private readonly usersApi = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  readonly items = signal<FollowUp[]>([]);
  readonly loading = signal(false);
  readonly view = signal<'all' | 'overdue' | 'planned' | 'mine'>('all');
  readonly search = signal('');
  readonly searchControl = this.fb.nonNullable.control('');
  readonly columns = [
    'title',
    'customer',
    'dueDate',
    'daysLeft',
    'assignee',
    'status',
    'actions',
  ];

  readonly canCreate = computed(() => this.auth.hasPermission('follow-ups', 'create'));
  readonly canUpdate = computed(() => this.auth.hasPermission('follow-ups', 'update'));
  readonly canComplete = computed(
    () =>
      this.auth.hasPermissionCode('followup.complete') ||
      this.auth.hasPermission('follow-ups', 'complete') ||
      this.auth.hasPermission('follow-ups', 'update')
  );
  readonly canDelete = computed(() => this.auth.hasPermission('follow-ups', 'delete'));

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    let list = this.items();
    if (!q) {
      return list;
    }
    return list.filter((f) => {
      const customer = this.customerName(f).toLowerCase();
      const assignee = this.userName(f).toLowerCase();
      return (
        f.title.toLowerCase().includes(q) ||
        (f.detail ?? '').toLowerCase().includes(q) ||
        (f.resultNote ?? '').toLowerCase().includes(q) ||
        customer.includes(q) ||
        assignee.includes(q) ||
        this.statusLabel(f).toLowerCase().includes(q) ||
        f.dueDate.toLowerCase().includes(q)
      );
    });
  });

  readonly pager = createClientPager(this.filtered);

  ngOnInit(): void {
    this.searchControl.valueChanges.subscribe((v) => this.search.set(v));
    this.customersApi.listCustomers({ limit: 100 }).subscribe();
    this.usersApi.loadForPicker(this.auth.currentUser()).subscribe();
    this.reload();
  }

  setView(view: 'all' | 'overdue' | 'planned' | 'mine'): void {
    this.view.set(view);
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    const view = this.view();
    const me = this.auth.currentUser();
    const params =
      view === 'overdue'
        ? { overdue: true as const, limit: 100 }
        : view === 'planned'
          ? { status: 'PLANNED' as const, limit: 100 }
          : view === 'mine' && me
            ? { assignedUserId: me.id, limit: 100 }
            : { limit: 100 };

    this.api.list(params).subscribe({
      next: (list) => {
        this.items.set(list);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.snack.open(err.message, 'ปิด', { duration: 3500 });
      },
    });
  }

  customerName(f: FollowUp): string {
    return f.customer?.name ?? this.customersApi.getCustomer(f.customerId)?.name ?? `#${f.customerId}`;
  }

  userName(f: FollowUp): string {
    if (f.assignedUser?.fullName) {
      return f.assignedUser.fullName;
    }
    if (!f.assignedUserId) {
      return '—';
    }
    return this.usersApi.getById(f.assignedUserId)?.fullName ?? `#${f.assignedUserId}`;
  }

  statusLabel(f: FollowUp): string {
    return followUpDisplayStatus(f);
  }

  daysLeftLabel(f: FollowUp): string {
    const days = this.api.daysUntilDue(f);
    if (days === null) {
      return '—';
    }
    if (days < 0) {
      return `เลยมา ${Math.abs(days)} วัน`;
    }
    if (days === 0) {
      return 'ครบวันนี้';
    }
    return `เหลือ ${days} วัน`;
  }

  daysLeftClass(f: FollowUp): string {
    if (f.status === 'DONE' || f.status === 'CANCELLED') {
      return '';
    }
    if (this.api.isOverdue(f)) {
      return 'overdue';
    }
    const days = this.api.daysUntilDue(f);
    if (days !== null && days <= 3) {
      return 'soon';
    }
    return '';
  }

  openCreate(row?: FollowUp): void {
    if (row ? !this.canUpdate() : !this.canCreate()) {
      this.snack.open('คุณไม่มีสิทธิ์ดำเนินการนี้', 'ปิด', { duration: 3000 });
      return;
    }
    const ref = this.dialog.open(FollowUpFormDialogComponent, {
      width: '560px',
      maxWidth: '95vw',
      data: row ?? null,
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.reload();
      }
    });
  }

  markDone(row: FollowUp): void {
    if (!this.canComplete()) {
      this.snack.open('คุณไม่มีสิทธิ์ปิดงานติดตาม', 'ปิด', { duration: 3000 });
      return;
    }
    const ref = this.dialog.open(FollowUpCompleteDialogComponent, {
      width: '520px',
      maxWidth: '95vw',
      data: row,
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.reload();
      }
    });
  }

  remove(row: FollowUp): void {
    if (!this.canDelete()) {
      return;
    }
    openConfirmDialog(this.dialog, {
      title: 'ลบงานติดตาม',
      message: `ต้องการลบงานติดตาม「${row.title}」หรือไม่?`,
      confirmLabel: 'ลบงานติดตาม',
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.api.remove(row.id).subscribe({
        next: () => {
          this.snack.open('ลบแล้ว', 'ปิด', { duration: 2500 });
          this.reload();
        },
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
      });
    });
  }
}

@Component({
  selector: 'app-follow-up-form-dialog',
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
  templateUrl: './follow-up-form-dialog.component.html',
  styleUrl: './follow-up-form-dialog.component.scss',
})
export class FollowUpFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(FollowUpService);
  private readonly customersApi = inject(CustomerService);
  private readonly usersApi = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject(MatDialogRef<FollowUpFormDialogComponent, boolean>);
  readonly data = inject<FollowUp | null>(MAT_DIALOG_DATA);

  readonly customers = this.customersApi.customers;
  readonly users = this.usersApi.users;
  readonly statuses = Object.keys(FOLLOW_UP_STATUS_LABELS) as FollowUpWritableStatus[];
  readonly statusLabels = FOLLOW_UP_STATUS_LABELS;
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly isEdit = !!this.data?.id;

  readonly form = this.fb.group({
    customerId: [
      { value: this.data?.customerId ?? 0, disabled: this.isEdit },
      Validators.min(1),
    ],
    title: [this.data?.title ?? '', Validators.required],
    dueDate: [parseDateOnly(this.data?.dueDate) as Date | null, Validators.required],
    assignedUserId: [this.data?.assignedUserId ?? (null as number | null)],
    status: [(this.data?.status === 'OVERDUE' ? 'PLANNED' : this.data?.status ?? 'PLANNED') as FollowUpWritableStatus],
    detail: [this.data?.detail ?? ''],
    resultNote: [this.data?.resultNote ?? ''],
  });

  overdueHint(): string | null {
    const due = this.form.getRawValue().dueDate;
    if (!due) {
      return null;
    }
    const dueStr = toDateOnlyString(due);
    const todayStr = toDateOnlyString(new Date());
    if (!dueStr || dueStr >= todayStr) {
      return null;
    }
    return 'วันครบกำหนดผ่านแล้ว — ระบบจะแสดงเป็น「เลยกำหนด」จาก isOverdue (สถานะในฐานยังเป็นวางแผนไว้)';
  }

  constructor() {
    if (!this.isEdit) {
      const preset = this.data?.customerId;
      const first = this.customers()[0];
      const me = this.auth.currentUser();
      this.form.patchValue({
        customerId: preset ?? first?.id ?? 0,
        assignedUserId: me?.id ?? null,
        dueDate: new Date(),
      });
      if (preset) {
        this.form.controls.customerId.disable({ emitEvent: false });
      }
    }
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);

    if (this.isEdit && this.data) {
      const payload: FollowUpUpdateInput = {
        title: raw.title ?? '',
        dueDate: toDateOnlyString(raw.dueDate),
        assignedUserId: raw.assignedUserId,
        status: (raw.status as FollowUpWritableStatus) ?? 'PLANNED',
        detail: raw.detail ?? '',
        resultNote: raw.resultNote ?? '',
      };
      this.api.update(this.data.id, payload).subscribe({
        next: (row) => this.onSaved(row, true),
        error: (err: Error) => this.onError(err),
      });
      return;
    }

    const payload: FollowUpCreateInput = {
      customerId: Number(raw.customerId),
      title: raw.title ?? '',
      dueDate: toDateOnlyString(raw.dueDate),
      assignedUserId: raw.assignedUserId,
      detail: raw.detail ?? '',
    };
    this.api.create(payload).subscribe({
      next: (row) => this.onSaved(row, false),
      error: (err: Error) => this.onError(err),
    });
  }

  private onSaved(row: FollowUp, isEdit: boolean): void {
    this.saving.set(false);
    this.snack.open(
      row.isOverdue
        ? 'บันทึกแล้ว — รายการนี้อยู่ในหมวดเลยกำหนด'
        : isEdit
          ? 'บันทึกแล้ว'
          : 'สร้างงานติดตามแล้ว',
      'ปิด',
      { duration: 2800 }
    );
    this.ref.close(true);
  }

  private onError(err: Error): void {
    this.saving.set(false);
    this.error.set(err.message);
  }
}

@Component({
  selector: 'app-follow-up-complete-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatCheckboxModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>ปิดงานติดตาม</h2>
    <mat-dialog-content>
      <p class="lead"><strong>{{ data.title }}</strong></p>
      <p class="muted">ลูกค้า: {{ customerLabel }}</p>

      <form [formGroup]="form" class="form" id="follow-up-complete-form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" class="full">
          <mat-label>ผลการติดตาม</mat-label>
          <textarea matInput rows="3" formControlName="resultNote" placeholder="สรุปสิ่งที่คุย / ผลลัพธ์"></textarea>
        </mat-form-field>

        <mat-checkbox formControlName="alsoLog">บันทึกการติดต่อครั้งนี้ด้วย</mat-checkbox>
        <p class="hint">
          แนะนำให้ติ๊กไว้ — การปิดงานติดตามอย่างเดียวจะไม่อัปเดต「ลูกค้าที่ถูกลืม」
        </p>

        @if (form.controls.alsoLog.value) {
          <mat-form-field appearance="outline" class="full">
            <mat-label>ช่องทางที่ติดต่อ</mat-label>
            <mat-select formControlName="channel">
              @for (ch of channels; track ch) {
                <mat-option [value]="ch">{{ channelLabels[ch] }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" class="full">
            <mat-label>เนื้อหาการติดต่อ</mat-label>
            <textarea matInput rows="2" formControlName="logContent"></textarea>
          </mat-form-field>
        }

        @if (error()) {
          <p class="error">{{ error() }}</p>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>ยกเลิก</button>
      <button
        mat-flat-button
        color="primary"
        type="submit"
        form="follow-up-complete-form"
        [disabled]="saving()"
      >
        ปิดงาน
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .lead { margin: 0 0 0.25rem; }
    .muted { margin: 0 0 1rem; color: #64748b; font-size: 0.9rem; }
    .form { display: flex; flex-direction: column; gap: 0.35rem; min-width: min(440px, 80vw); }
    .full { width: 100%; }
    .hint { margin: 0 0 0.5rem; font-size: 0.8rem; color: #64748b; line-height: 1.4; }
    .error { color: #b91c1c; margin: 0.25rem 0 0; }
  `,
})
export class FollowUpCompleteDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(FollowUpService);
  private readonly customersApi = inject(CustomerService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject(MatDialogRef<FollowUpCompleteDialogComponent, boolean>);
  readonly data = inject<FollowUp>(MAT_DIALOG_DATA);

  readonly channels = Object.keys(CHANNEL_LABELS) as CommunicationChannel[];
  readonly channelLabels = CHANNEL_LABELS;
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly customerLabel =
    this.data.customer?.name ??
    this.customersApi.getCustomer(this.data.customerId)?.name ??
    `#${this.data.customerId}`;

  readonly form = this.fb.nonNullable.group({
    resultNote: [this.data.resultNote ?? ''],
    alsoLog: [true],
    channel: ['PHONE' as CommunicationChannel],
    logContent: [this.data.resultNote || this.data.detail || this.data.title],
  });

  save(): void {
    const raw = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);

    this.api.complete(this.data.id, { resultNote: raw.resultNote }).subscribe({
      next: () => {
        if (!raw.alsoLog) {
          this.saving.set(false);
          this.snack.open('ปิดงานติดตามแล้ว', 'ปิด', { duration: 2500 });
          this.ref.close(true);
          return;
        }

        const me = this.auth.currentUser();
        this.customersApi
          .addLog(this.data.customerId, {
            channel: raw.channel,
            occurredAt: new Date().toISOString(),
            content: raw.logContent.trim() || raw.resultNote.trim() || this.data.title,
            subject: `ติดตาม: ${this.data.title}`,
            handledByUserId: me?.id,
          })
          .subscribe({
            next: () => {
              this.saving.set(false);
              this.snack.open('ปิดงานและบันทึกการติดต่อแล้ว', 'ปิด', { duration: 2800 });
              this.ref.close(true);
            },
            error: (err: Error) => {
              this.saving.set(false);
              this.snack.open(
                `ปิดงานแล้ว แต่บันทึกการติดต่อไม่สำเร็จ: ${err.message}`,
                'ปิด',
                { duration: 4500 }
              );
              this.ref.close(true);
            },
          });
      },
      error: (err: Error) => {
        this.saving.set(false);
        this.error.set(err.message);
      },
    });
  }
}
