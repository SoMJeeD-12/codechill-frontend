import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
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
import {
  FOLLOW_UP_CHANNEL_LABELS,
  FOLLOW_UP_STATUS_LABELS,
  FollowUp,
  FollowUpChannel,
  FollowUpStatus,
} from '../../core/models/follow-up.model';
import { AuthService } from '../../core/services/auth.service';
import { CustomerService } from '../../core/services/customer.service';
import { FollowUpInput, FollowUpService } from '../../core/services/follow-up.service';
import { UserService } from '../../core/services/user.service';
import { parseDateOnly, toDateOnlyString } from '../../core/utils/date.util';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';

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
    MatButtonToggleModule,
    MatDialogModule,
    MatSnackBarModule,
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
  readonly view = signal<'all' | 'overdue' | 'planned'>('all');
  readonly search = signal('');
  readonly searchControl = this.fb.nonNullable.control('');
  readonly columns = [
    'title',
    'customer',
    'dueDate',
    'daysLeft',
    'assignee',
    'channel',
    'status',
    'actions',
  ];

  readonly filtered = computed(() => {
    const view = this.view();
    let list = this.items();
    if (view === 'overdue') {
      list = list.filter((f) => this.api.isOverdue(f));
    } else if (view === 'planned') {
      list = list.filter((f) => f.status === 'PLANNED');
    }
    const q = this.search().trim().toLowerCase();
    if (q) {
      list = list.filter((f) => {
        const customer = this.customerName(f.customerId).toLowerCase();
        const assignee = this.userName(f.assigneeId).toLowerCase();
        return (
          f.title.toLowerCase().includes(q) ||
          (f.note ?? '').toLowerCase().includes(q) ||
          customer.includes(q) ||
          assignee.includes(q) ||
          this.channelLabel(f.channel).toLowerCase().includes(q) ||
          this.statusLabel(f).toLowerCase().includes(q) ||
          f.dueDate.toLowerCase().includes(q)
        );
      });
    }
    return [...list].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  });

  ngOnInit(): void {
    this.searchControl.valueChanges.subscribe((v) => this.search.set(v));
    this.customersApi.listCustomers().subscribe({
      next: (customers) => {
        const first = customers[0];
        const second = customers[1];
        const me = this.auth.currentUser();
        if (first) {
          this.api
            .ensureDemoSeed(first.id, me?.id ?? null, second?.id ?? null)
            .subscribe((list) => this.items.set(list));
        } else {
          this.reload();
        }
      },
      error: () => this.reload(),
    });
    this.usersApi.loadForPicker(this.auth.currentUser()).subscribe();
  }

  reload(): void {
    this.api.list().subscribe((list) => this.items.set(list));
  }

  customerName(id: number): string {
    return this.customersApi.getCustomer(id)?.name ?? `#${id}`;
  }

  userName(id: number | null): string {
    if (!id) {
      return '—';
    }
    return this.usersApi.getById(id)?.fullName ?? `#${id}`;
  }

  statusLabel(f: FollowUp): string {
    if (this.api.isOverdue(f)) {
      return 'เลยกำหนด';
    }
    return FOLLOW_UP_STATUS_LABELS[f.status];
  }

  channelLabel(channel: FollowUpChannel): string {
    return FOLLOW_UP_CHANNEL_LABELS[channel];
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
    const days = this.api.daysUntilDue(f);
    if (days === null) {
      return '';
    }
    // รายการที่ทำเสร็จแล้วไม่ต้องเน้นสีเตือน
    if (f.status === 'DONE' || f.status === 'CANCELLED') {
      return '';
    }
    if (days < 0) {
      return 'overdue';
    }
    if (days <= 3) {
      return 'soon';
    }
    return '';
  }

  openCreate(row?: FollowUp): void {
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
    const actor = this.auth.currentUser()?.fullName ?? 'ระบบ';
    this.api.markDone(row.id, actor).subscribe({
      next: () => {
        this.snack.open('บันทึกว่าติดตามแล้ว', 'ปิด', { duration: 2500 });
        this.reload();
      },
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
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
  readonly channels = Object.keys(FOLLOW_UP_CHANNEL_LABELS) as FollowUpChannel[];
  readonly channelLabels = FOLLOW_UP_CHANNEL_LABELS;
  readonly statuses = Object.keys(FOLLOW_UP_STATUS_LABELS) as FollowUpStatus[];
  readonly statusLabels = FOLLOW_UP_STATUS_LABELS;
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.group({
    customerId: [this.data?.customerId ?? 0, Validators.min(1)],
    title: [this.data?.title ?? '', Validators.required],
    dueDate: [parseDateOnly(this.data?.dueDate) as Date | null, Validators.required],
    assigneeId: [this.data?.assigneeId ?? (null as number | null)],
    channel: [(this.data?.channel ?? 'PHONE') as FollowUpChannel],
    status: [(this.data?.status ?? 'PLANNED') as FollowUpStatus],
    note: [this.data?.note ?? ''],
  });

  /** คำใบ้เมื่อวันครบกำหนดผ่านแล้ว */
  overdueHint(): string | null {
    const due = this.form.getRawValue().dueDate;
    const status = this.form.getRawValue().status as FollowUpStatus;
    if (!due) {
      return null;
    }
    const dueStr = toDateOnlyString(due);
    const todayStr = toDateOnlyString(new Date());
    if (!dueStr || dueStr >= todayStr) {
      return null;
    }
    if (status === 'PLANNED') {
      return 'วันครบกำหนดผ่านแล้ว และสถานะเป็น「วางแผนไว้」— หลังบันทึกจะอยู่ในหมวด เลยกำหนด';
    }
    return 'วันครบกำหนดผ่านแล้ว แต่สถานะไม่ใช่「วางแผนไว้」— จะไม่ขึ้นหมวด เลยกำหนด (ต้องเป็นวางแผนไว้)';
  }

  constructor() {
    if (!this.data) {
      const first = this.customers()[0];
      const me = this.auth.currentUser();
      this.form.patchValue({
        customerId: first?.id ?? 0,
        assigneeId: me?.id ?? null,
        dueDate: new Date(),
      });
    }
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const payload: FollowUpInput = {
      customerId: Number(raw.customerId),
      title: raw.title ?? '',
      dueDate: toDateOnlyString(raw.dueDate),
      assigneeId: raw.assigneeId,
      channel: (raw.channel as FollowUpChannel) ?? 'PHONE',
      status: (raw.status as FollowUpStatus) ?? 'PLANNED',
      note: raw.note ?? '',
    };
    const actor = this.auth.currentUser()?.fullName ?? 'ระบบ';
    this.saving.set(true);
    this.error.set(null);
    const req = this.data
      ? this.api.update(this.data.id, payload, actor)
      : this.api.create(payload, actor);
    req.subscribe({
      next: (row) => {
        this.saving.set(false);
        const overdue = this.api.isOverdue(row);
        this.snack.open(
          overdue
            ? 'บันทึกแล้ว — รายการนี้อยู่ในหมวดเลยกำหนด'
            : this.data
              ? 'บันทึกแล้ว'
              : 'สร้างแผนติดตามแล้ว',
          'ปิด',
          { duration: 2800 }
        );
        this.ref.close(true);
      },
      error: (err: Error) => {
        this.saving.set(false);
        this.error.set(err.message);
      },
    });
  }
}