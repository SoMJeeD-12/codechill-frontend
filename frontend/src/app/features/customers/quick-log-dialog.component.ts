import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  CHANNEL_LABELS,
  CommunicationChannel,
  Contact,
} from '../../core/models/customer.model';
import { AuthService } from '../../core/services/auth.service';
import { CustomerService } from '../../core/services/customer.service';
import {
  combineDateAndTime,
  nowTimeString,
} from '../../core/utils/date.util';
import {
  EntityPickerComponent,
  PickerOption,
  searchViaBackend,
} from '../../shared/components/entity-picker.component';
import { ThaiTimeInputDirective } from '../../shared/directives/thai-time-input.directive';

export interface QuickLogDialogData {
  /** ล็อกลูกค้าไว้ล่วงหน้า (เปิดจากหน้าลูกค้า) — ไม่ส่งมา = ให้ค้นหาเอง */
  customer?: PickerOption | null;
}

/**
 * บันทึกการติดต่อแบบเร็ว — เปิดได้จากทุกหน้า
 * พนักงานเพิ่งวางสายจากลูกค้า แล้วบันทึกได้ทันทีโดยไม่ต้องเปลี่ยนเมนู
 */
@Component({
  selector: 'app-quick-log-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatDatepickerModule,
    ThaiTimeInputDirective,
    EntityPickerComponent,
  ],
  template: `
    <h2 mat-dialog-title>บันทึกการติดต่อ</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="dlg-form" id="quick-log-form" (ngSubmit)="save()">
        @if (lockedCustomer) {
          <div class="locked-customer">
            <mat-icon>business</mat-icon>
            <div>
              <strong>{{ lockedCustomer.label }}</strong>
              @if (lockedCustomer.meta) {
                <small>{{ lockedCustomer.meta }}</small>
              }
            </div>
          </div>
        } @else {
          <app-entity-picker
            label="ลูกค้า"
            placeholder="พิมพ์ชื่อลูกค้าอย่างน้อย 2 ตัวอักษร"
            [searchFn]="searchCustomers"
            (selectionChange)="onCustomerPicked($event)"
          />
        }

        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>ช่องทาง</mat-label>
            <mat-select formControlName="channel">
              @for (ch of channels; track ch) {
                <mat-option [value]="ch">{{ channelLabels[ch] }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>ผู้ที่คุยด้วย</mat-label>
            <mat-select formControlName="contactId" [disabled]="!contacts().length">
              <mat-option [value]="null">—</mat-option>
              @for (contact of contacts(); track contact.id) {
                <mat-option [value]="contact.id">{{ contact.name }}</mat-option>
              }
            </mat-select>
            @if (!contacts().length) {
              <mat-hint>เลือกลูกค้าก่อน</mat-hint>
            }
          </mat-form-field>
        </div>

        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>วันที่ติดต่อ</mat-label>
            <input
              matInput
              [matDatepicker]="logPicker"
              formControlName="occurredDate"
              readonly
              (click)="logPicker.open()"
            />
            <mat-datepicker-toggle matIconSuffix [for]="logPicker" />
            <mat-datepicker #logPicker />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>เวลาที่ติดต่อ</mat-label>
            <input matInput appThaiTimeInput formControlName="occurredTime" />
            <span matTextSuffix>น.</span>
          </mat-form-field>
        </div>

        <mat-form-field appearance="outline" class="full">
          <mat-label>หัวข้อ</mat-label>
          <input matInput formControlName="subject" placeholder="เช่น สอบถามการใช้งาน" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>สรุปการคุย</mat-label>
          <textarea matInput rows="3" formControlName="content"></textarea>
        </mat-form-field>

        @if (error(); as e) {
          <p class="dlg-error">{{ e }}</p>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>ยกเลิก</button>
      <button
        mat-flat-button
        color="primary"
        type="submit"
        form="quick-log-form"
        [disabled]="saving()"
      >
        บันทึกการติดต่อ
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .dlg-form {
      display: grid;
      gap: 0.35rem;
      /* ต้องไม่กว้างกว่าเนื้อที่ของ dialog ไม่งั้นจะมีแถบเลื่อนแนวนอน */
      min-width: min(470px, 100%);
      max-width: 100%;
      padding-top: 0.25rem;
    }
    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.65rem;
    }
    .full {
      width: 100%;
    }
    .locked-customer {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.6rem 0.75rem;
      margin-bottom: 0.6rem;
      border-radius: 10px;
      background: rgb(15 118 110 / 0.08);
    }
    .locked-customer div {
      display: flex;
      flex-direction: column;
      line-height: 1.3;
    }
    .locked-customer small {
      color: rgb(0 0 0 / 0.6);
    }
    .dlg-error {
      margin: 0.25rem 0 0;
      color: #b3261e;
      font-size: 0.85rem;
    }
    @media (max-width: 560px) {
      .row {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class QuickLogDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(CustomerService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject(MatDialogRef<QuickLogDialogComponent, boolean>);
  private readonly data = inject<QuickLogDialogData | null>(MAT_DIALOG_DATA, {
    optional: true,
  });

  readonly lockedCustomer = this.data?.customer ?? null;
  readonly channelLabels = CHANNEL_LABELS;
  readonly channels = Object.keys(CHANNEL_LABELS) as CommunicationChannel[];
  readonly contacts = signal<Contact[]>([]);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  private customerId: number | null = this.lockedCustomer?.id ?? null;

  readonly form = this.fb.nonNullable.group({
    channel: ['PHONE' as CommunicationChannel, Validators.required],
    contactId: [null as number | null],
    subject: [''],
    content: ['', Validators.required],
    occurredDate: [new Date() as Date | null, Validators.required],
    occurredTime: [nowTimeString(), Validators.required],
  });

  constructor() {
    if (this.customerId != null) {
      this.loadContacts(this.customerId);
    }
  }

  readonly searchCustomers = (query: string) =>
    searchViaBackend(
      (params) => this.api.listCustomers(params),
      (c): PickerOption => ({
        id: c.id,
        label: c.name,
        code: c.code,
        meta: [c.code ?? '—', c.phone].filter(Boolean).join(' · '),
      }),
      query
    );

  onCustomerPicked(option: PickerOption | null): void {
    this.customerId = option?.id ?? null;
    this.form.patchValue({ contactId: null });
    this.contacts.set([]);
    if (option) {
      this.loadContacts(option.id);
    }
  }

  private loadContacts(customerId: number): void {
    this.api
      .listContacts(customerId)
      .pipe(catchError(() => of([] as Contact[])))
      .subscribe((rows) => {
        this.contacts.set(rows);
        const primary = rows.find((c) => c.isPrimary);
        if (primary) {
          this.form.patchValue({ contactId: primary.id });
        }
      });
  }

  save(): void {
    if (this.customerId == null) {
      this.error.set('เลือกลูกค้าก่อนบันทึก');
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('กรอกสรุปการคุยก่อนบันทึก');
      return;
    }

    const raw = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);

    this.api
      .addLog(this.customerId, {
        channel: raw.channel,
        occurredAt: combineDateAndTime(raw.occurredDate, raw.occurredTime),
        contactId: raw.contactId ?? undefined,
        subject: raw.subject.trim() || undefined,
        content: raw.content.trim() || undefined,
        handledByUserId: this.auth.currentUser()?.id,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.snack.open('บันทึกการติดต่อแล้ว', 'ปิด', { duration: 2500 });
          this.ref.close(true);
        },
        error: (err: Error) => {
          this.saving.set(false);
          this.error.set(err.message);
        },
      });
  }
}
