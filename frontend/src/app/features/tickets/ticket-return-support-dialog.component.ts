import {
  Component,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import {
  RESOLUTION_RESULT_LABELS,
  Ticket,
  TicketResolution,
  latestTicketResolution,
} from '../../core/models/ticket.model';
import { Observable } from 'rxjs';
import { TicketService } from '../../core/services/ticket.service';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';

export interface TicketReturnSupportDialogData {
  ticketId: number;
  ticketNo: string;
  title: string;
  receiverName: string;
  assigneeName: string;
  /** false = เปิดจากหน้าใบอยู่แล้ว */
  showOpenLink?: boolean;
  /** เปิดมาที่โหมดตรวจไม่ผ่านทันที (ปุ่ม「ตรวจไม่ผ่าน」) */
  initialMode?: 'approve' | 'reject';
}

/** ผลที่ dialog คืนเมื่อเรียก API สำเร็จ (ปิด/ยกเลิก = undefined) */
export type TicketReviewDialogResult = 'approved' | 'rejected';

const NOTE_MAX = 2000;

/**
 * แอดมินตรวจผลแก้ — ผ่าน (ส่งซัพพอร์ต + หมายเหตุ) หรือไม่ผ่าน (ส่งกลับผู้แก้ + เหตุผล)
 * เรียก API ในนี้เองเพื่อให้ error (409) แสดงโดยไม่เสียข้อความที่พิมพ์
 */
@Component({
  selector: 'app-ticket-return-support-dialog',
  standalone: true,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    RouterLink,
    ThaiDatePipe,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ mode() === 'reject' ? 'ไม่ผ่าน · ส่งกลับให้ผู้แก้' : 'ตรวจผ่าน · ส่งซัพพอร์ต' }}
    </h2>
    <mat-dialog-content>
      <p class="ref">{{ data.ticketNo }} · {{ data.title }}</p>

      @let r = last();
      @if (loading()) {
        <p class="muted">กำลังโหลดงานแก้ไข…</p>
      } @else if (loadError()) {
        <p class="warn-line">
          <mat-icon>error_outline</mat-icon>
          โหลดรายละเอียดงานแก้ไขไม่สำเร็จ — เปิดดูใบก่อนตัดสินใจ
        </p>
      } @else if (r) {
        <section class="round">
          <header>
            <strong>งานครั้งที่ {{ r.round }}</strong>
            <span class="result" [attr.data-result]="r.result">{{ resultLabel(r) }}</span>
          </header>
          <dl>
            <dt>ผู้แก้</dt>
            <dd>{{ r.resolvedBy?.fullName || '—' }}</dd>
            <dt>เสร็จเมื่อ</dt>
            <dd>{{ r.resolvedAt ? (r.resolvedAt | thaiDate) : '—' }}</dd>
            <dt>ชั่วโมง</dt>
            <dd>{{ r.hoursSpent != null ? r.hoursSpent + ' ชม.' : '—' }}</dd>
            <dt>สาเหตุ</dt>
            <dd class="clip">{{ r.rootCause?.trim() || '—' }}</dd>
            <dt>วิธีแก้</dt>
            <dd class="clip">{{ r.detail.trim() || '—' }}</dd>
            <dt>ไฟล์แนบ</dt>
            <dd>{{ r.attachments.length ? r.attachments.length + ' ไฟล์' : '—' }}</dd>
          </dl>
        </section>

        @if (warnings().length) {
          <ul class="warnings" aria-label="สิ่งที่ควรตรวจก่อนส่ง">
            @for (w of warnings(); track w) {
              <li>
                <mat-icon>warning_amber</mat-icon>
                {{ w }}
              </li>
            }
          </ul>
        }
      } @else {
        <p class="warn-line">
          <mat-icon>warning_amber</mat-icon>
          ใบนี้ยังไม่มีบันทึกงานแก้ไข
        </p>
      }

      @if (mode() === 'approve') {
        <div class="to">
          <mat-icon>support_agent</mat-icon>
          <div>
            <p>
              จะส่งเข้า <strong>คิวซัพพอร์ต</strong> แท็บ「แอดมินส่งกลับมา」— ซัพพอร์ตทุกคนเห็นและแจ้งลูกค้าได้
            </p>
            <p class="sub">ผู้รับเรื่องเดิม: {{ data.receiverName }}</p>
          </div>
        </div>

        <mat-form-field appearance="outline" class="text-field" subscriptSizing="dynamic">
          <mat-label>หมายเหตุถึงซัพพอร์ต (ไม่บังคับ)</mat-label>
          <textarea
            matInput
            rows="3"
            [maxLength]="noteMax"
            [value]="note()"
            (input)="note.set($any($event.target).value)"
            [disabled]="submitting()"
            placeholder="เช่น บอกลูกค้าให้ล้างแคชก่อนใช้งาน"
          ></textarea>
          <mat-hint>ต่อท้ายรายละเอียดใบเป็น「[ตรวจผ่าน] …」ซัพพอร์ตเห็นในหน้าใบ</mat-hint>
          <mat-hint align="end">{{ note().length }}/{{ noteMax }}</mat-hint>
        </mat-form-field>
      } @else {
        <div class="to to--reject">
          <mat-icon>undo</mat-icon>
          <div>
            <p>
              ใบจะกลับเป็น <strong>กำลังดำเนินการ</strong> และส่งกลับให้
              <strong>{{ data.assigneeName }}</strong> แก้ต่อ
            </p>
            <p class="sub">
              ผู้แก้ได้แจ้งเตือนในแอป · รอบที่ผู้แก้บันทึกครั้งถัดไปจะเป็นรอบใหม่ของใบเดิม
            </p>
          </div>
        </div>

        <mat-form-field appearance="outline" class="text-field" subscriptSizing="dynamic">
          <mat-label>เหตุผลที่ไม่ผ่าน</mat-label>
          <textarea
            matInput
            required
            rows="3"
            #reasonInput
            [maxLength]="noteMax"
            [value]="reason()"
            (input)="reason.set($any($event.target).value)"
            [disabled]="submitting()"
            placeholder="เช่น ยอดในรายงานยังไม่ตรงกับระบบบัญชี"
          ></textarea>
          <mat-hint>ต่อท้ายรายละเอียดใบเป็น「[ตรวจไม่ผ่าน] …」ผู้แก้เห็นในหน้าใบ</mat-hint>
          <mat-hint align="end">{{ reason().length }}/{{ noteMax }}</mat-hint>
        </mat-form-field>
      }

      @if (submitError()) {
        <p class="submit-error" role="alert">
          <mat-icon>error_outline</mat-icon>
          {{ submitError() }}
        </p>
      }
    </mat-dialog-content>
    <mat-dialog-actions>
      @if (mode() === 'approve') {
        @if (data.showOpenLink !== false) {
          <a mat-button [routerLink]="['/app/tickets', data.ticketId]" mat-dialog-close class="open-link">
            <mat-icon>open_in_new</mat-icon>
            เปิดดูใบ
          </a>
        }
        <span class="spacer"></span>
        <button mat-button type="button" mat-dialog-close [disabled]="submitting()">ยกเลิก</button>
        <button
          mat-stroked-button
          type="button"
          class="reject-btn"
          [disabled]="loading() || submitting()"
          (click)="switchMode('reject')"
        >
          ไม่ผ่าน · ส่งกลับให้ผู้แก้
        </button>
        <button
          mat-flat-button
          color="primary"
          type="button"
          [disabled]="loading() || submitting()"
          (click)="approve()"
        >
          {{ submitting() ? 'กำลังส่ง…' : 'ตรวจผ่าน · ส่งซัพพอร์ต' }}
        </button>
      } @else {
        <button mat-button type="button" [disabled]="submitting()" (click)="switchMode('approve')">
          <mat-icon>arrow_back</mat-icon>
          ย้อนกลับ
        </button>
        <span class="spacer"></span>
        <button mat-button type="button" mat-dialog-close [disabled]="submitting()">ยกเลิก</button>
        <button
          mat-flat-button
          type="button"
          class="reject-confirm"
          [disabled]="!reason().trim() || submitting()"
          (click)="reject()"
        >
          {{ submitting() ? 'กำลังส่ง…' : 'ยืนยันไม่ผ่าน' }}
        </button>
      }
    </mat-dialog-actions>
  `,
  styles: `
    .ref {
      margin: 0 0 0.85rem;
      color: #64748b;
      font-size: 0.85rem;
    }
    .muted {
      color: #64748b;
    }
    .round {
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 0.85rem 1rem;

      header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.6rem;
      }
    }
    .result {
      padding: 0.1rem 0.55rem;
      border-radius: 999px;
      font-size: 0.78rem;
      font-weight: 600;
      background: #f1f5f9;
      color: #475569;

      &[data-result='SUCCESS'] {
        background: #dcfce7;
        color: #166534;
      }
      &[data-result='PARTIAL'] {
        background: #fef3c7;
        color: #92400e;
      }
      &[data-result='FAILED'] {
        background: #fee2e2;
        color: #991b1b;
      }
    }
    dl {
      display: grid;
      grid-template-columns: 5.5rem 1fr;
      gap: 0.35rem 0.75rem;
      margin: 0;
      font-size: 0.9rem;
    }
    dt {
      color: #64748b;
    }
    dd {
      margin: 0;
      color: #1e293b;
      min-width: 0;
    }
    .clip {
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
      white-space: pre-wrap;
    }
    .warnings {
      list-style: none;
      margin: 0.75rem 0 0;
      padding: 0.6rem 0.85rem;
      border-radius: 10px;
      background: #fffbeb;
      border: 1px solid #fde68a;
      display: grid;
      gap: 0.3rem;

      li {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        color: #92400e;
        font-size: 0.86rem;
      }
    }
    .warn-line {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      color: #92400e;
    }
    .to {
      display: flex;
      align-items: flex-start;
      gap: 0.4rem;
      margin: 0.9rem 0 0;
      color: #334155;
      font-size: 0.9rem;

      p {
        margin: 0;
      }
      .sub {
        margin-top: 0.15rem;
        color: #64748b;
        font-size: 0.82rem;
      }
      mat-icon {
        margin-top: 0.1rem;
      }
    }
    mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
      flex: 0 0 auto;
    }
    .to--reject {
      color: #7c2d12;

      mat-icon {
        color: #c2410c;
      }
    }
    .text-field {
      width: 100%;
      margin-top: 0.9rem;

      textarea {
        resize: vertical;
        min-height: 4.5rem;
      }
    }
    .submit-error {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      margin: 0.75rem 0 0;
      padding: 0.55rem 0.75rem;
      border-radius: 8px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #991b1b;
      font-size: 0.88rem;
    }
    .reject-btn {
      color: #b45309;
      border-color: #f59e0b;
    }
    .reject-confirm:not(:disabled) {
      background: #d97706;
      color: #fff;
    }
    .open-link mat-icon {
      margin-right: 0.25rem;
    }
    .spacer {
      flex: 1 1 auto;
    }
  `,
})
export class TicketReturnSupportDialogComponent implements OnInit {
  readonly data = inject<TicketReturnSupportDialogData>(MAT_DIALOG_DATA);
  private readonly ticketsApi = inject(TicketService);
  private readonly dialogRef =
    inject<MatDialogRef<TicketReturnSupportDialogComponent, TicketReviewDialogResult>>(MatDialogRef);
  private readonly injector = inject(Injector);
  private readonly reasonInput = viewChild<ElementRef<HTMLTextAreaElement>>('reasonInput');

  readonly noteMax = NOTE_MAX;
  readonly mode = signal<'approve' | 'reject'>('approve');
  readonly note = signal('');
  readonly reason = signal('');
  readonly submitting = signal(false);
  readonly submitError = signal<string | null>(null);

  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly ticket = signal<Ticket | null>(null);
  readonly last = computed(() => latestTicketResolution(this.ticket()));

  readonly warnings = computed(() => {
    const r = this.last();
    if (!r) {
      return [];
    }
    const out: string[] = [];
    if (r.result !== 'SUCCESS') {
      out.push(`รอบล่าสุดผลเป็น「${this.resultLabel(r)}」ไม่ใช่「สำเร็จ」`);
    }
    if (r.hoursSpent == null) {
      out.push('ผู้แก้ยังไม่กรอกชั่วโมงทำงาน');
    }
    if (!r.attachments.length) {
      out.push('รอบล่าสุดไม่มีไฟล์แนบ / สแกนใบยืนยัน');
    }
    const earlier = (this.ticket()?.resolutions ?? []).filter((x) => x.id !== r.id);
    const failedBefore = earlier.filter((x) => x.result !== 'SUCCESS').length;
    if (failedBefore > 0) {
      out.push(
        `ใบนี้แก้ไป ${earlier.length + 1} รอบ — เคยไม่สำเร็จ/สำเร็จบางส่วน ${failedBefore} รอบ`
      );
    }
    return out;
  });

  ngOnInit(): void {
    if (this.data.initialMode === 'reject') {
      this.switchMode('reject');
    }
    this.ticketsApi.get(this.data.ticketId).subscribe({
      next: (t) => {
        this.ticket.set(t);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set(true);
        this.loading.set(false);
      },
    });
  }

  switchMode(mode: 'approve' | 'reject'): void {
    this.mode.set(mode);
    this.submitError.set(null);
    if (mode === 'reject') {
      afterNextRender(() => this.reasonInput()?.nativeElement.focus(), { injector: this.injector });
    }
  }

  approve(): void {
    this.submit(this.ticketsApi.returnToSupport(this.data.ticketId, this.note()), 'approved');
  }

  reject(): void {
    const reason = this.reason().trim();
    if (!reason) {
      return;
    }
    this.submit(this.ticketsApi.rejectReview(this.data.ticketId, reason), 'rejected');
  }

  private submit(req: Observable<unknown>, result: TicketReviewDialogResult): void {
    this.submitting.set(true);
    this.submitError.set(null);
    this.dialogRef.disableClose = true;
    req.subscribe({
      next: () => this.dialogRef.close(result),
      error: (err: Error) => {
        this.submitting.set(false);
        this.dialogRef.disableClose = false;
        this.submitError.set(err.message || 'ทำรายการไม่สำเร็จ');
      },
    });
  }

  resultLabel(r: TicketResolution): string {
    return RESOLUTION_RESULT_LABELS[r.result] ?? r.result;
  }
}
