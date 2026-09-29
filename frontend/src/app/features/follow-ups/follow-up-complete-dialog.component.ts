import { Component, Injectable, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Observable, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { ApiEnvelopeService } from '../../core/http/api-envelope.service';
import { CHANNEL_LABELS, CommunicationChannel } from '../../core/models/customer.model';
import { FollowUp, FollowUpCompleteResult } from '../../core/models/follow-up.model';
import { AuthService } from '../../core/services/auth.service';
import { CustomerService } from '../../core/services/customer.service';
import { FollowUpCompleteInput, FollowUpService } from '../../core/services/follow-up.service';
import { NavAttentionService } from '../../core/services/nav-attention.service';
import { QuickActionsService } from '../../core/services/quick-actions.service';
import { addDays, addMonthsClamped, toDateOnlyString } from '../../core/utils/date.util';
import { openConfirmDialog } from '../../shared/components/confirm-dialog.component';
import { FORM_DIALOG } from '../../shared/utils/form-dialog';

const NEXT_TITLE_MAX = 255;

function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * ปิดงานติดตาม (M7-02) — บันทึกผล + นัดครั้งถัดไปได้ในคำขอเดียว
 * PATCH /follow-ups/:id/complete { resultNote, nextDueDate?, nextTitle? }
 * ห้ามยิง POST /follow-ups แยกเพื่อสร้างงานถัดไป (จะได้งานซ้ำ)
 */
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
    MatDatepickerModule,
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

        <mat-checkbox formControlName="scheduleNext">นัดติดตามครั้งถัดไป</mat-checkbox>

        @if (scheduleNext()) {
          <div class="next-box">
            <div class="next-date">
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>วันติดตามครั้งถัดไป</mat-label>
                <input
                  matInput
                  readonly
                  class="date-readonly"
                  [matDatepicker]="nextPicker"
                  [min]="minDate"
                  formControlName="nextDueDate"
                  required
                  (click)="nextPicker.open()"
                  (keydown.enter)="nextPicker.open()"
                />
                <mat-datepicker-toggle matIconSuffix [for]="nextPicker" />
                <mat-datepicker #nextPicker />
                @if (form.controls.nextDueDate.hasError('required') && form.controls.nextDueDate.touched) {
                  <mat-error>กรุณาเลือกวันติดตามครั้งถัดไป</mat-error>
                }
                @if (form.controls.nextDueDate.hasError('matDatepickerMin')) {
                  <mat-error>วันติดตามครั้งถัดไปต้องไม่ก่อนวันนี้</mat-error>
                }
              </mat-form-field>
              <div class="quick">
                <button mat-stroked-button type="button" (click)="setNextIn('d', 7)">+7 วัน</button>
                <button mat-stroked-button type="button" (click)="setNextIn('d', 14)">+14 วัน</button>
                <button mat-stroked-button type="button" (click)="setNextIn('m', 1)">+1 เดือน</button>
              </div>
            </div>
            <mat-form-field appearance="outline" class="full" subscriptSizing="dynamic">
              <mat-label>เรื่อง</mat-label>
              <input matInput formControlName="nextTitle" [placeholder]="data.title" [maxlength]="nextTitleMax" />
              <mat-hint>เว้นว่าง = ใช้เรื่องเดิม · ผู้รับผิดชอบ/โปรเจกต์ใช้ของงานนี้</mat-hint>
            </mat-form-field>
          </div>
        }

        <mat-checkbox formControlName="alsoLog">บันทึกการติดต่อครั้งนี้ด้วย</mat-checkbox>

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
      <button mat-button type="button" mat-dialog-close [disabled]="saving()">ยกเลิก</button>
      <button
        mat-flat-button
        color="primary"
        type="submit"
        form="follow-up-complete-form"
        [disabled]="saving()"
      >
        {{ saving() ? 'กำลังบันทึก…' : scheduleNext() ? 'ปิดงานและนัดครั้งถัดไป' : 'ปิดงาน' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .lead { margin: 0 0 0.25rem; }
    .muted { margin: 0 0 1rem; color: #64748b; font-size: 0.9rem; }
    .form { display: flex; flex-direction: column; gap: 0.35rem; min-width: min(720px, 92vw); }
    .full { width: 100%; }
    .next-box {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin: 0.25rem 0 0.75rem;
      padding: 0.85rem 0.85rem 0.5rem;
      border-radius: 10px;
      background: #f1f7f5;
    }
    .next-date { display: flex; flex-wrap: wrap; gap: 0.5rem 0.75rem; align-items: flex-start; }
    .quick { display: flex; gap: 0.4rem; padding-top: 0.5rem; }
    .error { color: #b91c1c; margin: 0.25rem 0 0; }
    .date-readonly { cursor: pointer; }
  `,
})
export class FollowUpCompleteDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(FollowUpService);
  private readonly customersApi = inject(CustomerService);
  private readonly auth = inject(AuthService);
  private readonly envelope = inject(ApiEnvelopeService);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject(
    MatDialogRef<FollowUpCompleteDialogComponent, FollowUpCompleteResult | undefined>
  );
  readonly data = inject<FollowUp>(MAT_DIALOG_DATA);

  readonly channels = Object.keys(CHANNEL_LABELS) as CommunicationChannel[];
  readonly channelLabels = CHANNEL_LABELS;
  readonly nextTitleMax = NEXT_TITLE_MAX;
  readonly minDate = today();
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly customerLabel =
    this.data.customer?.name ??
    this.customersApi.getCustomer(this.data.customerId)?.name ??
    `#${this.data.customerId}`;

  readonly form = this.fb.nonNullable.group({
    resultNote: [this.data.resultNote ?? ''],
    scheduleNext: [false],
    nextDueDate: this.fb.control<Date | null>(null),
    nextTitle: ['', Validators.maxLength(NEXT_TITLE_MAX)],
    alsoLog: [true],
    channel: ['PHONE' as CommunicationChannel],
    logContent: [this.data.resultNote || this.data.detail || this.data.title],
  });

  readonly scheduleNext = toSignal(this.form.controls.scheduleNext.valueChanges, {
    initialValue: false,
  });

  constructor() {
    this.form.controls.scheduleNext.valueChanges.subscribe((on) => {
      const ctrl = this.form.controls.nextDueDate;
      ctrl.setValidators(on ? [Validators.required] : []);
      if (on && !ctrl.value) {
        ctrl.setValue(addDays(today(), 7));
      }
      ctrl.updateValueAndValidity();
    });
  }

  setNextIn(unit: 'd' | 'm', n: number): void {
    const base = today();
    this.form.controls.nextDueDate.setValue(unit === 'd' ? addDays(base, n) : addMonthsClamped(base, n));
    this.form.controls.nextDueDate.markAsTouched();
  }

  save(): void {
    if (this.saving()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const input: FollowUpCompleteInput = { resultNote: raw.resultNote };
    if (raw.scheduleNext) {
      const due = raw.nextDueDate;
      if (!due || due < today()) {
        this.error.set('วันติดตามครั้งถัดไปต้องไม่ก่อนวันนี้');
        return;
      }
      input.nextDueDate = toDateOnlyString(due);
      input.nextTitle = raw.nextTitle.trim() || undefined;
    }
    this.saving.set(true);
    this.error.set(null);

    this.api.complete(this.data.id, input).subscribe({
      next: (result) => {
        const message =
          this.envelope.takeMessage() ??
          (result.nextFollowUp ? 'ปิดงานติดตามและนัดครั้งถัดไปเรียบร้อย' : 'ปิดงานติดตามเรียบร้อย');
        if (!raw.alsoLog) {
          this.snack.open(message, 'ปิด', { duration: 3000 });
          this.ref.close(result);
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
              this.snack.open(`${message} · บันทึกการติดต่อแล้ว`, 'ปิด', { duration: 3200 });
              this.ref.close(result);
            },
            error: (err: Error) => {
              this.snack.open(`${message} แต่บันทึกการติดต่อไม่สำเร็จ: ${err.message}`, 'ปิด', {
                duration: 4500,
              });
              this.ref.close(result);
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

/**
 * จุดเดียวที่เปิด dialog ปิดงานติดตาม — หน้างานติดตาม / หน้าแรก / แท็บโปรเจกต์ / ลูกค้า 360°
 * สำเร็จแล้ว: ดึง /nav/counts ใหม่ แล้วถาม "บันทึกการติดต่อเลยไหม" ต่อ
 * (ปิดงานติดตามไม่อัปเดตวันติดต่อล่าสุดของลูกค้า — ต้องบันทึกการติดต่อแยก)
 */
@Injectable({ providedIn: 'root' })
export class FollowUpCompleteFlowService {
  private readonly dialog = inject(MatDialog);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly quickActions = inject(QuickActionsService);
  private readonly attention = inject(NavAttentionService);
  private readonly customersApi = inject(CustomerService);

  readonly canComplete = computed(() => {
    this.auth.session();
    return (
      this.auth.hasPermissionCode('followup.complete') ||
      this.auth.hasPermission('follow-ups', 'complete') ||
      this.auth.hasPermission('follow-ups', 'update')
    );
  });

  canCompleteRow(row: FollowUp): boolean {
    return row.status === 'PLANNED' && this.canComplete();
  }

  /** คืนผลการปิด (มี nextFollowUp ถ้านัดครั้งถัดไป) · ยกเลิก = null */
  open(row: FollowUp): Observable<FollowUpCompleteResult | null> {
    if (!this.canComplete()) {
      this.snack.open('คุณไม่มีสิทธิ์ปิดงานติดตาม', 'ปิด', { duration: 3000 });
      return of(null);
    }
    return this.dialog
      .open<FollowUpCompleteDialogComponent, FollowUp, FollowUpCompleteResult | undefined>(
        FollowUpCompleteDialogComponent,
        { ...FORM_DIALOG, data: row }
      )
      .afterClosed()
      .pipe(
        map((result) => result ?? null),
        tap((result) => {
          if (!result) {
            return;
          }
          this.attention.refreshBadges();
          this.offerCommunicationLog(row);
        })
      );
  }

  private offerCommunicationLog(row: FollowUp): void {
    if (!this.quickActions.canLogCommunication()) {
      return;
    }
    const customerName =
      row.customer?.name ?? this.customersApi.getCustomer(row.customerId)?.name ?? `#${row.customerId}`;
    openConfirmDialog(this.dialog, {
      title: 'บันทึกการติดต่อเลยไหม',
      message: `ปิดงานติดตาม「${row.title}」แล้ว\nต้องการบันทึกประวัติการติดต่อของ ${customerName} ตอนนี้เลยไหม?`,
      confirmLabel: 'บันทึกเลย',
      cancelLabel: 'ไว้ทีหลัง',
      danger: false,
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.quickActions
        .openCommunicationLog({ customer: { id: row.customerId, label: customerName } })
        .subscribe();
    });
  }
}
