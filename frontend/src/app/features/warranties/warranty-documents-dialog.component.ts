import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  Warranty,
  warrantyDisplayLabel,
  warrantyDisplayState,
  warrantyNeedsSignedScan,
} from '../../core/models/warranty.model';
import { WarrantyService } from '../../core/services/warranty.service';
import { EntityAttachmentsComponent } from '../../shared/components/entity-attachments.component';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { FORM_DIALOG } from '../../shared/utils/form-dialog';
import { openWarrantyPrintWindow } from './warranty-print';

export interface WarrantyDocumentsDialogData {
  warranty: Warranty;
  /** แนบ/ลบไฟล์สำเร็จ — หน้าที่เปิดโหลดรายการใหม่ (ป้าย "ยังไม่แนบใบที่ลูกค้าเซ็น" จะหายเอง) */
  onChanged?: () => void;
}

/** เปิดรายละเอียด/เอกสารของใบประกัน — ใช้ร่วมกันทุกหน้า */
export function openWarrantyDocuments(
  dialog: MatDialog,
  warranty: Warranty,
  onChanged?: () => void
): void {
  dialog.open(WarrantyDocumentsDialogComponent, {
    ...FORM_DIALOG,
    data: { warranty, onChanged } satisfies WarrantyDocumentsDialogData,
  });
}

/** พิมพ์ใบรับประกัน — ใช้ร่วมกันทุกหน้า · พิมพ์ได้ทุกสถานะ (ยกเลิก/หมดอายุมีลายน้ำ) */
export function printWarranty(
  api: WarrantyService,
  snack: MatSnackBar,
  warrantyId: number,
  onLoaded?: (noteSuggestion: string) => void
): void {
  const win = openWarrantyPrintWindow((done, fail) => {
    api.getPrint(warrantyId).subscribe({
      next: (payload) => {
        done(payload);
        onLoaded?.(payload.attachScanHint?.noteSuggestion ?? '');
      },
      error: (err: Error) => {
        fail(err.message);
        snack.open(err.message || 'โหลดข้อมูลใบรับประกันไม่สำเร็จ', 'ปิด', { duration: 4000 });
      },
    });
  });
  if (!win) {
    snack.open('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ใบรับประกัน', 'ปิด', { duration: 3500 });
  }
}

@Component({
  selector: 'app-warranty-documents-dialog',
  standalone: true,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    EntityAttachmentsComponent,
    ThaiDatePipe,
  ],
  template: `
    <h2 mat-dialog-title>เอกสารใบรับประกัน {{ code }}</h2>
    <mat-dialog-content>
      <div class="summary">
        <span class="status" [attr.data-status]="state">{{ statusLabel }}</span>
        <span>
          {{ data.warranty.startDate | thaiDate: 'date' }} –
          {{ data.warranty.endDate | thaiDate: 'date' }}
        </span>
        @if (data.warranty.delivery?.title) {
          <span class="muted">· {{ data.warranty.delivery?.title }}</span>
        }
        @if (needsScan()) {
          <span class="unsigned-badge">
            <mat-icon>error_outline</mat-icon>
            ยังไม่แนบใบที่ลูกค้าเซ็น
          </span>
        }
      </div>

      <div class="print-row">
        <button mat-stroked-button type="button" (click)="print()">
          <mat-icon>print</mat-icon>
          พิมพ์ใบรับประกัน
        </button>
        <p class="muted">
          พิมพ์ให้ลูกค้าเซ็น แล้วสแกนแนบกลับด้านล่าง
          @if (state === 'VOID' || state === 'EXPIRED') {
            · ใบนี้จะมีลายน้ำ「{{ statusLabel }}」
          }
        </p>
      </div>

      <app-entity-attachments
        refType="WARRANTY"
        [refId]="data.warranty.id"
        heading="เอกสารแนบของใบประกัน"
        subtitle="เช่น ใบรับประกันที่ลูกค้าเซ็นแล้ว (สแกน/ถ่ายรูป)"
        [defaultNote]="noteSuggestion()"
        (countChange)="attachmentCount.set($event)"
        (changed)="data.onChanged?.()"
      />
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>ปิด</button>
    </mat-dialog-actions>
  `,
  styles: `
    .summary {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.35rem 0.6rem;
      margin-bottom: 0.75rem;
      font-size: 0.9rem;
    }
    .print-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem 0.75rem;
      margin-bottom: 1rem;
    }
    .print-row p {
      margin: 0;
    }
    .muted {
      color: #5b6762;
      font-size: 0.85rem;
    }
    .status[data-status='ACTIVE'] {
      color: #0f766e;
      font-weight: 600;
    }
    .status[data-status='VOID'],
    .status[data-status='EXPIRED'] {
      color: #b91c1c;
      font-weight: 600;
    }
  `,
})
export class WarrantyDocumentsDialogComponent {
  private readonly api = inject(WarrantyService);
  private readonly snack = inject(MatSnackBar);
  readonly data = inject<WarrantyDocumentsDialogData>(MAT_DIALOG_DATA);

  readonly code = this.data.warranty.warrantyNo?.trim() || `#${this.data.warranty.id}`;
  readonly state = warrantyDisplayState(this.data.warranty);
  readonly statusLabel = warrantyDisplayLabel(this.data.warranty);
  readonly noteSuggestion = signal<string | null>(`ใบรับประกัน ${this.code} ที่ลูกค้าเซ็นแล้ว`);
  /** เริ่มจาก attachmentCount ของ API แล้วอัปเดตตามรายการไฟล์จริงในกล่อง */
  readonly attachmentCount = signal(this.data.warranty.attachmentCount);

  needsScan(): boolean {
    return warrantyNeedsSignedScan({
      attachmentCount: this.attachmentCount(),
      status: this.data.warranty.status,
    });
  }

  print(): void {
    printWarranty(this.api, this.snack, this.data.warranty.id, (note) => {
      if (note.trim()) {
        this.noteSuggestion.set(note.trim());
      }
    });
  }
}
