import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { ApiProjectDocument } from '../../core/models/document.model';
import {
  DELIVERY_ACCEPTANCE_LABELS,
  Delivery,
} from '../../core/models/project.model';
import { DocumentService } from '../../core/services/document.service';
import { EntityAttachmentsComponent } from '../../shared/components/entity-attachments.component';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { FORM_DIALOG_WIDE } from '../../shared/utils/form-dialog';
import { DocumentPreviewDialogComponent } from '../documents/document-preview-dialog.component';

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
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    ThaiDatePipe,
    EntityAttachmentsComponent,
  ],
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

        <section class="preview-story">
          <h4>รายละเอียด</h4>
          <p>{{ d.description?.trim() || 'ไม่มีรายละเอียด' }}</p>
          <h4>หมายเหตุ</h4>
          <p>{{ noteText.trim() || 'ไม่มีหมายเหตุ' }}</p>
        </section>

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
          @if (attachment || files().length || filesLoading()) {
            <div class="full">
              <dt>ไฟล์หลักฐาน</dt>
              <dd>
                @if (filesLoading()) {
                  <span class="file-miss">กำลังโหลดไฟล์…</span>
                } @else if (files().length) {
                  @for (file of files(); track file.id) {
                    <div class="file-row">
                      <mat-icon>description</mat-icon>
                      <span class="file-name">{{ file.fileName }}</span>
                      <button mat-stroked-button type="button" (click)="preview(file)">
                        ดูตัวอย่าง
                      </button>
                      <button
                        mat-button
                        type="button"
                        [disabled]="downloadingId() === file.id"
                        (click)="download(file)"
                      >
                        ดาวน์โหลด
                      </button>
                    </div>
                  }
                } @else {
                  <span>{{ attachment?.fileName || '—' }}</span>
                  <p class="file-miss">
                    {{ filesError() || 'ไม่พบไฟล์ในเอกสารโปรเจกต์ จึงเปิดดูหรือดาวน์โหลดไม่ได้' }}
                  </p>
                }
              </dd>
            </div>
          }
        </dl>

        <app-entity-attachments refType="DELIVERY" [refId]="d.id" />
      </article>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>ปิด</button>
    </mat-dialog-actions>
  `,
  styles: `
    .preview-story {
      margin: 0 0 0.85rem;
      h4 {
        margin: 0.7rem 0 0;
        font-size: 0.75rem;
        font-weight: 750;
        color: var(--app-accent);
      }
      h4:first-child {
        margin-top: 0;
      }
      p {
        margin: 0.25rem 0 0;
        color: var(--app-ink);
        font-size: 0.98rem;
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
      }
    }
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
    .file-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.35rem 0.5rem;
      mat-icon {
        color: var(--app-accent);
        width: 1.15rem;
        height: 1.15rem;
        font-size: 1.15rem;
      }
    }
    .file-name {
      min-width: 0;
      word-break: break-all;
    }
    .file-miss {
      margin: 0.2rem 0 0;
      color: var(--app-muted);
      font-size: 0.82rem;
    }
    @media (max-width: 560px) {
      .preview-card__grid {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class DeliveryPreviewDialogComponent {
  private readonly docsApi = inject(DocumentService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  readonly ref = inject(MatDialogRef<DeliveryPreviewDialogComponent>);
  readonly data = inject<DeliveryPreviewDialogData>(MAT_DIALOG_DATA);
  readonly d = this.data.delivery;
  readonly acceptanceLabel =
    DELIVERY_ACCEPTANCE_LABELS[this.d.acceptanceStatus] ?? this.d.acceptanceStatus;
  readonly attachment = parseDeliveryAttachment(this.d.note);
  readonly noteText = deliveryNoteText(this.d.note);
  readonly files = signal<ApiProjectDocument[]>([]);
  readonly filesLoading = signal(false);
  readonly filesError = signal<string | null>(null);
  readonly downloadingId = signal<number | null>(null);

  constructor() {
    this.loadFiles();
  }

  preview(file: ApiProjectDocument): void {
    this.dialog.open(DocumentPreviewDialogComponent, {
      ...FORM_DIALOG_WIDE,
      data: { document: file },
    });
  }

  download(file: ApiProjectDocument): void {
    this.downloadingId.set(file.id);
    this.docsApi
      .download(file)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.downloadingId.set(null),
        error: (err: Error) => {
          this.downloadingId.set(null);
          this.snack.open(err.message || 'ดาวน์โหลดไม่สำเร็จ', 'ปิด', { duration: 4000 });
        },
      });
  }

  private loadFiles(): void {
    const projectId = this.d.projectId;
    if (!projectId || (!this.attachment && !this.d.id)) {
      return;
    }
    if (this.attachment) {
      this.filesLoading.set(true);
    }
    const named = this.attachment?.fileName ?? null;
    const byName = named
      ? this.docsApi.listByProject(projectId, { search: named, limit: 50 })
      : of({ items: [] as ApiProjectDocument[], total: 0 });
    byName
      .pipe(
        switchMap((page) => {
          const found = this.pick(page.items);
          if (found.length) {
            return of(found);
          }
          return this.docsApi
            .listByProject(projectId, { search: `ส่งมอบ #${this.d.id}`, limit: 50 })
            .pipe(
              switchMap((refPage) => {
                const refFound = this.pick(refPage.items);
                if (refFound.length) {
                  return of(refFound);
                }
                return this.docsApi
                  .listByProject(projectId, { limit: 100 })
                  .pipe(map((all) => this.pick(all.items)));
              })
            );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (rows) => {
          this.files.set(rows);
          this.filesLoading.set(false);
        },
        error: (err: Error) => {
          this.files.set([]);
          this.filesError.set(err.message || 'โหลดไฟล์ไม่สำเร็จ');
          this.filesLoading.set(false);
        },
      });
  }

  private pick(rows: ApiProjectDocument[]): ApiProjectDocument[] {
    const seen = new Set<number>();
    return rows.filter((doc) => {
      if (seen.has(doc.id) || !deliveryDocMatches(doc, this.d.id, this.attachment)) {
        return false;
      }
      seen.add(doc.id);
      return true;
    });
  }
}

export function parseDeliveryAttachment(
  note: string | null
): { fileName: string; documentId: number | null } | null {
  const text = note?.trim() ?? '';
  const match = text.match(/^แนบไฟล์:\s*(.+)$/);
  if (!match) {
    return null;
  }
  const rest = match[1].trim();
  const idMatch = rest.match(/·\s*เอกสาร\s*#(\d+)\s*$/);
  const fileName = rest.replace(/\s*·\s*เอกสาร\s*#\d+\s*$/, '').trim();
  if (!fileName) {
    return null;
  }
  return {
    fileName,
    documentId: idMatch ? Number(idMatch[1]) : null,
  };
}

function deliveryNoteText(note: string | null): string {
  const text = note?.trim() ?? '';
  if (!text || parseDeliveryAttachment(text)) {
    return '—';
  }
  return text;
}

function deliveryDocMatches(
  doc: ApiProjectDocument,
  deliveryId: number,
  attachment: { fileName: string; documentId: number | null } | null
): boolean {
  if (attachment?.documentId != null && doc.id === attachment.documentId) {
    return true;
  }
  if ((doc.note ?? '').includes(`อ้างอิงการส่งมอบ #${deliveryId}`)) {
    return true;
  }
  return !!attachment && doc.fileName.trim() === attachment.fileName;
}
