import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TaskSubmission } from '../../core/models/project.model';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { downloadAuthorizedBlobAs } from '../../shared/utils/download-blob';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'รอตรวจ',
  APPROVED: 'ผ่าน',
  REJECTED: 'ส่งกลับแก้ไข',
};

/** ประวัติรอบส่งของงาน — รายงาน + หมายเหตุ/ไฟล์ของผู้ตรวจ (ใหม่สุดก่อน) */
@Component({
  selector: 'app-task-submission-history',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, ThaiDatePipe],
  template: `
    @if (rounds().length) {
      <ol class="rounds">
        @for (sub of rounds(); track sub.id ?? $index) {
          <li class="round" [attr.data-status]="sub.status">
            <div class="round__head">
              <span class="round__status">{{ statusLabel(sub.status) }}</span>
              <span class="round__date">
                ส่ง {{ sub.submittedAt ? (sub.submittedAt | thaiDate) : '—' }}
                @if (sub.reviewedAt) {
                  · ตรวจ {{ sub.reviewedAt | thaiDate }}
                }
              </span>
            </div>
            @if (sub.report) {
              <p class="round__report">{{ sub.report }}</p>
            }
            @if (sub.reviewNote || sub.reviewDownloadUrl) {
              <div class="round__review">
                <strong>หมายเหตุผู้ตรวจ</strong>
                @if (sub.reviewNote) {
                  <p>{{ sub.reviewNote }}</p>
                }
                @if (sub.reviewDownloadUrl) {
                  <button
                    mat-stroked-button
                    type="button"
                    [disabled]="downloadingId() === (sub.id ?? $index)"
                    (click)="download(sub, sub.id ?? $index)"
                  >
                    <mat-icon>download</mat-icon>
                    {{ sub.reviewFileName || 'ไฟล์จากผู้ตรวจ' }}
                  </button>
                }
              </div>
            }
          </li>
        }
      </ol>
    } @else {
      <p class="empty">{{ emptyText() }}</p>
    }
  `,
  styles: `
    .rounds {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 0.5rem;
    }
    .round {
      border: 1px solid var(--app-line);
      border-left-width: 3px;
      border-radius: 8px;
      padding: 0.5rem 0.75rem;
      &[data-status='REJECTED'] {
        border-left-color: var(--app-danger);
      }
      &[data-status='APPROVED'] {
        border-left-color: var(--app-success);
      }
    }
    .round__head {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem 0.75rem;
      align-items: baseline;
      font-size: 0.82rem;
      color: var(--app-muted);
    }
    .round__status {
      font-weight: 600;
      color: var(--app-text-soft);
    }
    .round__report,
    .round__review p {
      margin: 0.35rem 0 0;
      white-space: pre-wrap;
      font-size: 0.88rem;
    }
    .round__review {
      margin-top: 0.4rem;
      padding: 0.4rem 0.6rem;
      background: var(--app-warn-soft);
      border-radius: 6px;
      strong {
        font-size: 0.8rem;
        color: var(--app-warn-ink);
      }
      button {
        margin-top: 0.35rem;
      }
    }
    .empty {
      margin: 0;
      color: var(--app-muted);
      font-size: 0.85rem;
    }
  `,
})
export class TaskSubmissionHistoryComponent {
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);

  readonly submissions = input<TaskSubmission[] | null | undefined>([]);
  /** ไม่แสดงรอบที่ยังรอตรวจ — ใช้ในหน้าตรวจที่โชว์รอบปัจจุบันแยกอยู่แล้ว */
  readonly excludePending = input(false);
  readonly emptyText = input('ยังไม่มีรอบส่งก่อนหน้า');

  readonly downloadingId = signal<number | null>(null);

  readonly rounds = computed(() => {
    let rows = [...(this.submissions() ?? [])];
    if (this.excludePending()) {
      rows = rows.filter((s) => (s.status ?? '').toUpperCase() !== 'PENDING');
    }
    return rows.sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''));
  });

  statusLabel(status: string | null): string {
    return STATUS_LABELS[(status ?? '').toUpperCase()] ?? status ?? '—';
  }

  download(sub: TaskSubmission, key: number): void {
    if (!sub.reviewDownloadUrl) {
      return;
    }
    this.downloadingId.set(key);
    downloadAuthorizedBlobAs(this.http, sub.reviewDownloadUrl, sub.reviewFileName || '').subscribe({
      next: () => this.downloadingId.set(null),
      error: (err: Error) => {
        this.downloadingId.set(null);
        this.snack.open(err.message || 'ดาวน์โหลดไฟล์ไม่สำเร็จ', 'ปิด', { duration: 4000 });
      },
    });
  }
}
