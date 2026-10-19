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
      {{ mode() === 'reject' ? 'ตรวจรับงานแก้ · ไม่ผ่าน ส่งกลับให้ผู้แก้' : 'ตรวจรับงานแก้ · ผ่าน ส่งซัพพอร์ต' }}
    </h2>
    <mat-dialog-content>
      <p class="ref">{{ data.title }}</p>

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
            <dd>
              <div class="clip" [class.clip--open]="causeOpen()">{{ r.rootCause?.trim() || '—' }}</div>
              @if (isLong(r.rootCause)) {
                <button type="button" class="more" (click)="causeOpen.set(!causeOpen())">
                  {{ causeOpen() ? 'ย่อ' : 'ดูเพิ่มเติม' }}
                </button>
              }
            </dd>
            <dt>วิธีแก้</dt>
            <dd>
              <div class="clip" [class.clip--open]="detailOpen()">{{ r.detail.trim() || '—' }}</div>
              @if (isLong(r.detail)) {
                <button type="button" class="more" (click)="detailOpen.set(!detailOpen())">
                  {{ detailOpen() ? 'ย่อ' : 'ดูเพิ่มเติม' }}
                </button>
              }
            </dd>
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
          <mat-hint align="end">{{ note().length }}/{{ noteMax }}</mat-hint>
        </mat-form-field>
      } @else {
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
      color: var(--app-muted);
      font-size: 0.85rem;
    }
    .muted {
      color: var(--app-muted);
    }
    .round {
      border: 1px solid var(--app-line);
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
      background: var(--app-surface-3);
      color: var(--app-text-soft);

      &[data-result='SUCCESS'] {
        background: var(--app-success-soft);
        color: var(--app-success);
      }
      &[data-result='PARTIAL'] {
        background: var(--app-warn-soft);
        color: var(--app-warn-ink);
      }
      &[data-result='FAILED'] {
        background: var(--app-danger-soft);
        color: var(--app-danger-ink);
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
      color: var(--app-muted);
    }
    dd {
      margin: 0;
      color: var(--app-ink);
      min-width: 0;
    }
    .clip {
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .clip--open {
      display: block;
      -webkit-line-clamp: unset;
      max-height: 14rem;
      overflow-y: auto;
      padding-right: 0.25rem;
    }
    .more {
      margin: 0.2rem 0 0;
      padding: 0;
      border: 0;
      background: none;
      color: var(--app-accent);
      font: inherit;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
    }
    .more:hover {
      text-decoration: underline;
    }
    .warnings {
      list-style: none;
      margin: 0.75rem 0 0;
      padding: 0.6rem 0.85rem;
      border-radius: 10px;
      background: var(--app-warn-soft);
      border: 1px solid var(--app-warn-line);
      display: grid;
      gap: 0.3rem;

      li {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        color: var(--app-warn-ink);
        font-size: 0.86rem;
      }
    }
    .warn-line {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      color: var(--app-warn-ink);
    }
    mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
      flex: 0 0 auto;
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
      background: var(--app-danger-soft);
      border: 1px solid var(--app-danger-line);
      color: var(--app-danger-ink);
      font-size: 0.88rem;
    }
    .reject-btn {
      color: var(--app-warn);
      border-color: var(--app-warn);
    }
    .reject-confirm:not(:disabled) {
      background: var(--app-warn);
      color: var(--app-on-solid);
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
  readonly causeOpen = signal(false);
  readonly detailOpen = signal(false);

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

  /** ยาวเกิน 3 บรรทัดโดยประมาณ — แสดงปุ่มดูเพิ่มเติม */
  isLong(text: string | null | undefined): boolean {
    const t = text?.trim() ?? '';
    return t.length > 150 || t.split('\n').length > 3;
  }

  resultLabel(r: TicketResolution): string {
    return RESOLUTION_RESULT_LABELS[r.result] ?? r.result;
  }
}
