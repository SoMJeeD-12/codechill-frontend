import { Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  ApiProjectDocument,
  formatDocumentFileSize,
} from '../../core/models/document.model';
import { DocumentService } from '../../core/services/document.service';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { triggerBlobDownload } from '../../shared/utils/download-blob';

export interface DocumentPreviewDialogData {
  document: ApiProjectDocument;
}

type PreviewKind = 'pdf' | 'image' | 'text' | 'unsupported';

@Component({
  selector: 'app-document-preview-dialog',
  standalone: true,
  imports: [
    ThaiDatePipe,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>รายละเอียดเอกสาร</h2>
    <mat-dialog-content>
      <header class="doc-meta">
        <h3>{{ doc.title || doc.fileName }}</h3>
        <p class="meta-line">{{ doc.fileName }} · {{ sizeLabel }}</p>
        <p class="meta-line muted">
          อัปโหลดโดย {{ doc.uploadedBy?.fullName || '—' }}
          · {{ doc.createdAt | thaiDate }}
        </p>
        @if (doc.note) {
          <p class="note">{{ doc.note }}</p>
        }
      </header>

      <div class="preview-shell">
        @if (loading()) {
          <div class="preview-state">
            <mat-spinner diameter="40" />
            <p>กำลังโหลดตัวอย่าง…</p>
          </div>
        } @else if (error()) {
          <div class="preview-state error">
            <mat-icon>error_outline</mat-icon>
            <p>{{ error() }}</p>
          </div>
        } @else if (kind() === 'pdf' && safeUrl()) {
          <iframe
            #previewFrame
            class="preview-frame"
            title="ตัวอย่าง PDF"
            [src]="safeUrl()"
          ></iframe>
        } @else if (kind() === 'image' && imageUrl()) {
          <div class="preview-image-wrap">
            <img [src]="imageUrl()" [alt]="doc.fileName" />
          </div>
        } @else if (kind() === 'text') {
          <pre class="preview-text">{{ textContent() }}</pre>
        } @else {
          <div class="preview-state">
            <mat-icon>description</mat-icon>
            <p>
              ชนิดไฟล์นี้ยังแสดงตัวอย่างในเบราว์เซอร์ไม่ได้
              — ดาวน์โหลดแล้วเปิดด้วยโปรแกรมที่เกี่ยวข้อง
            </p>
          </div>
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>ปิด</button>
      <button
        mat-stroked-button
        type="button"
        [disabled]="loading() || !!error() || !canPrint()"
        (click)="print()"
      >
        <mat-icon>print</mat-icon>
        พิมพ์
      </button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="loading() || !!error() || !blob()"
        (click)="download()"
      >
        <mat-icon>download</mat-icon>
        ดาวน์โหลด
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    :host {
      display: block;
    }
    h2[mat-dialog-title] {
      margin: 0;
    }
    mat-dialog-content {
      display: grid;
      gap: 0.85rem;
      min-width: min(100%, 52rem);
      max-height: min(78vh, 720px);
    }
    .doc-meta h3 {
      margin: 0 0 0.25rem;
      font-size: 1.1rem;
      color: #0f172a;
    }
    .meta-line {
      margin: 0;
      font-size: 0.9rem;
      color: #0f766e;
      word-break: break-word;
    }
    .meta-line.muted {
      color: #64748b;
      font-size: 0.85rem;
    }
    .note {
      margin: 0.45rem 0 0;
      color: #475569;
      font-size: 0.88rem;
      line-height: 1.45;
      white-space: pre-wrap;
    }
    .preview-shell {
      min-height: 22rem;
      border: 1px solid #d8e5e1;
      border-radius: 12px;
      background: #f8faf9;
      overflow: hidden;
    }
    .preview-frame {
      display: block;
      width: 100%;
      height: min(56vh, 520px);
      border: 0;
      background: #fff;
    }
    .preview-image-wrap {
      display: grid;
      place-items: center;
      max-height: min(56vh, 520px);
      overflow: auto;
      padding: 0.75rem;
      background: #eef4f2;
    }
    .preview-image-wrap img {
      max-width: 100%;
      height: auto;
      border-radius: 6px;
      box-shadow: 0 4px 16px rgba(15, 23, 42, 0.08);
    }
    .preview-text {
      margin: 0;
      padding: 1rem 1.1rem;
      max-height: min(56vh, 520px);
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: ui-monospace, Consolas, monospace;
      font-size: 0.85rem;
      line-height: 1.5;
      color: #1e293b;
      background: #fff;
    }
    .preview-state {
      display: grid;
      place-items: center;
      gap: 0.65rem;
      min-height: 22rem;
      padding: 1.5rem;
      text-align: center;
      color: #475569;
    }
    .preview-state mat-icon {
      font-size: 2.25rem;
      width: 2.25rem;
      height: 2.25rem;
      color: #0f766e;
    }
    .preview-state.error {
      color: #b91c1c;
    }
    .preview-state.error mat-icon {
      color: #b91c1c;
    }
    .preview-state p {
      margin: 0;
      max-width: 28rem;
      line-height: 1.5;
    }
    mat-dialog-actions button mat-icon {
      margin-right: 0.25rem;
      font-size: 1.15rem;
      width: 1.15rem;
      height: 1.15rem;
      vertical-align: middle;
    }
  `,
})
export class DocumentPreviewDialogComponent implements OnDestroy {
  @ViewChild('previewFrame') previewFrame?: ElementRef<HTMLIFrameElement>;

  private readonly api = inject(DocumentService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly snack = inject(MatSnackBar);
  readonly data = inject<DocumentPreviewDialogData>(MAT_DIALOG_DATA);

  readonly doc = this.data.document;
  readonly sizeLabel = formatDocumentFileSize(this.doc.fileSize);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly kind = signal<PreviewKind>('unsupported');
  readonly safeUrl = signal<SafeResourceUrl | null>(null);
  readonly imageUrl = signal<string | null>(null);
  readonly textContent = signal('');
  readonly blob = signal<Blob | null>(null);

  private objectUrl: string | null = null;
  private resolvedFileName = this.doc.fileName || 'download';

  constructor() {
    this.api.fetchBlob(this.doc).subscribe({
      next: ({ blob, fileName }) => {
        this.resolvedFileName = fileName || this.resolvedFileName;
        this.blob.set(blob);
        const mime = (blob.type || this.doc.mimeType || '').toLowerCase();
        const previewKind = detectPreviewKind(mime, this.resolvedFileName);
        this.kind.set(previewKind);

        if (previewKind === 'text') {
          blob
            .text()
            .then((text) => {
              this.textContent.set(text);
              this.loading.set(false);
            })
            .catch(() => {
              this.kind.set('unsupported');
              this.loading.set(false);
            });
          return;
        }

        if (previewKind === 'pdf' || previewKind === 'image') {
          this.objectUrl = URL.createObjectURL(blob);
          if (previewKind === 'pdf') {
            this.safeUrl.set(
              this.sanitizer.bypassSecurityTrustResourceUrl(this.objectUrl)
            );
          } else {
            this.imageUrl.set(this.objectUrl);
          }
        }
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.error.set(err.message || 'โหลดเอกสารไม่สำเร็จ');
        this.loading.set(false);
      },
    });
  }

  ngOnDestroy(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  canPrint(): boolean {
    const k = this.kind();
    return !!this.blob() && (k === 'pdf' || k === 'image' || k === 'text');
  }

  download(): void {
    const b = this.blob();
    if (!b) {
      return;
    }
    triggerBlobDownload(b, this.resolvedFileName);
  }

  print(): void {
    const k = this.kind();
    if (!this.canPrint()) {
      this.snack.open(
        'ชนิดไฟล์นี้พิมพ์ตัวอย่างไม่ได้ — กรุณาดาวน์โหลดแล้วเปิดด้วยโปรแกรมที่เกี่ยวข้อง',
        'ปิด',
        { duration: 4000 }
      );
      return;
    }

    if (k === 'pdf') {
      const frame = this.previewFrame?.nativeElement;
      try {
        frame?.contentWindow?.focus();
        frame?.contentWindow?.print();
        return;
      } catch {
        /* fall through to popup */
      }
    }

    if (k === 'image' && this.objectUrl) {
      this.printHtmlWindow(
        `<img src="${this.objectUrl}" style="max-width:100%;" alt="" />`
      );
      return;
    }

    if (k === 'text') {
      const escaped = escapeHtml(this.textContent());
      this.printHtmlWindow(
        `<pre style="white-space:pre-wrap;font-family:ui-monospace,Consolas,monospace;font-size:12px;">${escaped}</pre>`
      );
      return;
    }

    if (this.objectUrl) {
      const win = window.open(this.objectUrl, '_blank');
      if (win) {
        win.addEventListener('load', () => {
          try {
            win.focus();
            win.print();
          } catch {
            /* ignore */
          }
        });
      }
    }
  }

  private printHtmlWindow(bodyHtml: string): void {
    const title = escapeHtml(this.doc.title || this.resolvedFileName);
    const win = window.open('', '_blank');
    if (!win) {
      this.snack.open('เบราว์เซอร์บล็อกหน้าต่างพิมพ์', 'ปิด', { duration: 3500 });
      return;
    }
    win.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="utf-8" />
<title>${title}</title>
<style>
  body{font-family:Sarabun,Segoe UI,sans-serif;margin:1.25rem;color:#0f172a}
  h1{font-size:1.1rem;margin:0 0 .75rem}
  @media print{button{display:none}}
</style></head><body>
<h1>${title}</h1>
${bodyHtml}
<script>window.onload=function(){setTimeout(function(){window.print()},50)}</script>
</body></html>`);
    win.document.close();
  }
}

function detectPreviewKind(mime: string, fileName: string): PreviewKind {
  const lowerName = fileName.toLowerCase();
  if (mime.includes('pdf') || lowerName.endsWith('.pdf')) {
    return 'pdf';
  }
  if (
    mime.startsWith('image/') ||
    /\.(jpe?g|png|gif|webp|bmp)$/i.test(lowerName)
  ) {
    return 'image';
  }
  if (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/csv' ||
    /\.(txt|csv|json|log|md)$/i.test(lowerName)
  ) {
    return 'text';
  }
  return 'unsupported';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
