import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { AttachmentRefType } from '../../core/models/attachment.model';
import { EntityAttachmentsComponent } from '../../shared/components/entity-attachments.component';

export interface RecordPreviewField {
  label: string;
  value: string;
  full?: boolean;
}

export interface RecordPreviewDialogData {
  title: string;
  heading: string;
  meta?: string | null;
  fields: RecordPreviewField[];
  /** ไฟล์แนบจาก GET /api/attachments */
  attachmentRef?: { refType: AttachmentRefType; refId: number } | null;
}

/** ป็อปอัปรายละเอียดในมุมมอง 360° — เลย์เอาต์เดียวกับรายละเอียดการส่งมอบ */
@Component({
  selector: 'app-customer-record-preview-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, EntityAttachmentsComponent],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <article class="preview-card">
        <header class="preview-card__head">
          <h3>{{ data.heading || '—' }}</h3>
          @if (data.meta) {
            <p class="meta">{{ data.meta }}</p>
          }
        </header>
        <dl class="preview-card__grid">
          @for (field of data.fields; track field.label) {
            <div [class.full]="field.full">
              <dt>{{ field.label }}</dt>
              <dd [class.desc]="field.full">{{ field.value || '—' }}</dd>
            </div>
          }
        </dl>
        @if (data.attachmentRef; as att) {
          <app-entity-attachments [refType]="att.refType" [refId]="att.refId" />
        }
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
        color: var(--app-muted);
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
      background: var(--app-surface-2);
      border: 1px solid color-mix(in srgb, var(--app-ink) 6%, transparent);
      div {
        min-width: 0;
      }
      .full {
        grid-column: 1 / -1;
      }
      dt {
        margin: 0;
        font-size: 0.75rem;
        color: var(--app-muted);
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
export class CustomerRecordPreviewDialogComponent {
  readonly data = inject<RecordPreviewDialogData>(MAT_DIALOG_DATA);
}
