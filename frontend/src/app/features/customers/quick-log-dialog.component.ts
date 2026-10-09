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
import { Observable, concat, of } from 'rxjs';
import { catchError, map, switchMap, toArray } from 'rxjs/operators';
import { apiErrorMessage } from '../../core/http/api-error';
import {
  DOCUMENT_ACCEPT,
  DOCUMENT_MAX_BYTES,
  formatDocumentFileSize,
} from '../../core/models/document.model';
import { UserSummary } from '../../core/models/user.model';
import { AttachmentService } from '../../core/services/attachment.service';
import { UserService } from '../../core/services/user.service';
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
} from '../../shared/components/entity-picker.component';
import { customerSearchFn } from '../../shared/components/entity-search';
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
            placeholder="พิมพ์ชื่อลูกค้า"
            [openOnFocus]="true"
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
        <mat-form-field appearance="outline" class="full">
          <mat-label>ผู้รับเรื่อง</mat-label>
          <mat-select formControlName="handledByUserId">
            @for (u of handlers(); track u.id) {
              <mat-option [value]="u.id">{{ u.fullName }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        @if (canUploadFiles) {
          <div class="files">
            <div class="files__head">
              <div>
                <strong>ไฟล์แนบ</strong>
                <span class="files__hint">เช่น รูปแชต ใบเสนอราคา (ไม่บังคับ)</span>
              </div>
              <button
                mat-stroked-button
                type="button"
                [disabled]="saving()"
                (click)="fileInput.click()"
              >
                <mat-icon>attach_file</mat-icon>
                เลือกไฟล์
              </button>
              <input
                #fileInput
                type="file"
                multiple
                hidden
                [accept]="fileAccept"
                (change)="onFilesPicked($event)"
              />
            </div>
            @if (files().length) {
              <ul class="files__list">
                @for (f of files(); track $index) {
                  <li>
                    <mat-icon>description</mat-icon>
                    <span class="files__name" [title]="f.name">{{ f.name }}</span>
                    <span class="files__size">{{ fileSize(f.size) }}</span>
                    <button
                      mat-icon-button
                      type="button"
                      [disabled]="saving()"
                      aria-label="เอาไฟล์ออก"
                      (click)="removeFile($index)"
                    >
                      <mat-icon>close</mat-icon>
                    </button>
                  </li>
                }
              </ul>
            }
          </div>
        }

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
      min-width: min(1040px, 100%);
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
      background: color-mix(in srgb, var(--app-accent) 8%, transparent);
    }
    .locked-customer div {
      display: flex;
      flex-direction: column;
      line-height: 1.3;
    }
    .locked-customer small {
      color: color-mix(in srgb, var(--app-ink) 60%, transparent);
    }
    .files {
      display: grid;
      gap: 0.4rem;
      margin-bottom: 0.5rem;
    }
    .files__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      div {
        display: flex;
        flex-direction: column;
      }
    }
    .files__hint,
    .files__size {
      color: var(--app-muted);
      font-size: 0.8rem;
    }
    .files__list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 0.25rem;
      li {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        min-width: 0;
      }
    }
    .files__name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .dlg-error {
      margin: 0.25rem 0 0;
      color: var(--app-danger);
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
  private readonly usersApi = inject(UserService);
  private readonly attachmentsApi = inject(AttachmentService);
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
    handledByUserId: [this.auth.currentUser()?.id ?? (null as number | null)],
  });

  readonly canUploadFiles = this.auth.hasPermissionCode('file.upload');
  readonly fileAccept = DOCUMENT_ACCEPT;
  readonly files = signal<File[]>([]);
  readonly handlers = signal<UserSummary[]>(this.selfAsHandler());

  constructor() {
    if (this.customerId != null) {
      this.loadContacts(this.customerId);
    }
    this.usersApi
      .listAssignableAll()
      .pipe(catchError(() => of([] as UserSummary[])))
      .subscribe((rows) => {
        const self = this.selfAsHandler();
        const merged = [...rows];
        for (const s of self) {
          if (!merged.some((u) => u.id === s.id)) {
            merged.unshift(s);
          }
        }
        this.handlers.set(merged);
      });
  }

  private selfAsHandler(): UserSummary[] {
    const me = this.auth.currentUser();
    return me ? [{ id: me.id, username: me.username, fullName: me.fullName }] : [];
  }

  onFilesPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = Array.from(input.files ?? []);
    input.value = '';
    const tooBig = picked.filter((f) => f.size > DOCUMENT_MAX_BYTES);
    if (tooBig.length) {
      this.snack.open(
        `ไฟล์ใหญ่เกิน 20 MB: ${tooBig.map((f) => f.name).join(', ')}`,
        'ปิด',
        { duration: 4500 }
      );
    }
    const ok = picked.filter((f) => f.size <= DOCUMENT_MAX_BYTES);
    if (ok.length) {
      this.files.update((list) => [...list, ...ok]);
    }
  }

  removeFile(index: number): void {
    this.files.update((list) => list.filter((_, i) => i !== index));
  }

  fileSize(bytes: number): string {
    return formatDocumentFileSize(bytes);
  }

  readonly searchCustomers = customerSearchFn(this.api);

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
        handledByUserId: raw.handledByUserId ?? undefined,
      })
      .pipe(
        switchMap((log) =>
          this.uploadFiles(log.id).pipe(map((failed) => ({ log, failed })))
        )
      )
      .subscribe({
        next: ({ failed }) => {
          this.saving.set(false);
          this.snack.open(
            failed.length
              ? `บันทึกการติดต่อแล้ว แต่แนบไฟล์ไม่สำเร็จ: ${failed.join(', ')}`
              : 'บันทึกการติดต่อแล้ว',
            'ปิด',
            { duration: failed.length ? 6000 : 2500 }
          );
          this.ref.close(true);
        },
        error: (err: Error) => {
          this.saving.set(false);
          this.error.set(err.message);
        },
      });
  }

  /** อัปโหลดทีละไฟล์ — คืนชื่อไฟล์ (เหตุผล) ที่ไม่ผ่าน · บันทึกการติดต่อที่สร้างแล้วไม่ล้ม */
  private uploadFiles(logId: number): Observable<string[]> {
    const files = this.files();
    if (!files.length) {
      return of([]);
    }
    return concat(
      ...files.map((file) =>
        this.attachmentsApi.upload({ file, refType: 'COMMUNICATION_LOG', refId: logId }).pipe(
          map((): string | null => null),
          catchError((err: unknown) => of(`${file.name} (${apiErrorMessage(err)})`))
        )
      )
    ).pipe(
      toArray(),
      map((outcomes) => outcomes.filter((f): f is string => f != null))
    );
  }
}
