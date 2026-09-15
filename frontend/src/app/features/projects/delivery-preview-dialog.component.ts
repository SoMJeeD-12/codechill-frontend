import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import {
  DELIVERY_ACCEPTANCE_LABELS,
  Delivery,
} from '../../core/models/project.model';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';

export interface DeliveryPreviewDialogData {
  delivery: Delivery;
  deliveredByName: string;
  acceptedByName: string;
}

/**
 * ป็อปอัปรายละเอียดการส่งมอบ — เลย์เอาต์แนวเดียวกับ customer-preview-dialog
 */
@Component({
  selector: 'app-delivery-preview-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, ThaiDatePipe],
  template: `
    <h2 mat-dialog-title>รายละเอียดการส่งมอบ</h2>
    <mat-dialog-content>
      <article class="preview-card">
        <header class="preview-card__head">
          <h3>{{ d.title || '—' }}</h3>
          <p class="meta">
            ส่งมอบ #{{ d.id }}
            @if (d.deliveryNo) {
              · {{ d.deliveryNo }}
            }
            · {{ acceptanceLabel }}
          </p>
        </header>

        <dl class="preview-card__grid">
          <div>
            <dt>เวอร์ชัน</dt>
            <dd>{{ d.version || '—' }}</dd>
          </div>
          <div>
            <dt>วันเวลาส่ง</dt>
            <dd>{{ d.deliveredAt | thaiDate }}</dd>
          </div>
          <div>
            <dt>ผู้ส่งมอบ</dt>
            <dd>{{ data.deliveredByName }}</dd>
          </div>
          <div>
            <dt>ผู้รับมอบ</dt>
            <dd>{{ data.acceptedByName }}</dd>
          </div>
          <div>
            <dt>สถานะยอมรับ</dt>
            <dd>{{ acceptanceLabel }}</dd>
          </div>
          <div>
            <dt>ครั้งสุดท้าย</dt>
            <dd>{{ d.isFinal ? 'ใช่' : 'ไม่ใช่' }}</dd>
          </div>
          <div>
            <dt>ออกประกันได้</dt>
            <dd>{{ d.canIssueWarranty ? 'ได้' : 'ไม่ได้' }}</dd>
          </div>
          @if (d.acceptedAt) {
            <div>
              <dt>ยอมรับเมื่อ</dt>
              <dd>{{ d.acceptedAt | thaiDate }}</dd>
            </div>
          }
          <div class="full">
            <dt>รายละเอียด</dt>
            <dd class="desc">{{ d.description || '—' }}</dd>
          </div>
          <div class="full">
            <dt>หมายเหตุ</dt>
            <dd class="desc">{{ d.note || '—' }}</dd>
          </div>
        </dl>
      </article>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>ปิด</button>
    </mat-dialog-actions>
  `,
  styles: `
    .preview-card__head {
      margin-bottom: 0.85rem;
      h3 {
        margin: 0;
        font-size: 1.2rem;
        font-weight: 700;
        line-height: 1.35;
      }
      .meta {
        margin: 0.25rem 0 0;
        color: #5b6762;
        font-size: 0.88rem;
      }
    }
    .preview-card__grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.65rem 1rem;
      margin: 0;
      padding: 0.85rem 0.95rem;
      border-radius: 12px;
      background: #f8fafc;
      border: 1px solid rgb(15 23 42 / 0.06);
      div {
        min-width: 0;
      }
      .full {
        grid-column: 1 / -1;
      }
      dt {
        margin: 0;
        font-size: 0.75rem;
        color: #64748b;
      }
      dd {
        margin: 0.15rem 0 0;
        font-size: 0.92rem;
        word-break: break-word;
      }
      dd.desc {
        white-space: pre-wrap;
        line-height: 1.45;
      }
    }
    @media (max-width: 560px) {
      .preview-card__grid {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class DeliveryPreviewDialogComponent {
  readonly ref = inject(MatDialogRef<DeliveryPreviewDialogComponent>);
  readonly data = inject<DeliveryPreviewDialogData>(MAT_DIALOG_DATA);
  readonly d = this.data.delivery;
  readonly acceptanceLabel =
    DELIVERY_ACCEPTANCE_LABELS[this.d.acceptanceStatus] ?? this.d.acceptanceStatus;
}
