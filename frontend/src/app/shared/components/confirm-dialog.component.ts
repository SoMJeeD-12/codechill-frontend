import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
} from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ConfirmDialogData {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** ซ่อนปุ่มยกเลิก — ใช้โหมดดูรายละเอียด */
  hideCancel?: boolean;
  /**
   * true = ปุ่มแดง (ลบ/ทำลาย)
   * false = ปุ่ม primary ปกติ (เริ่มใช้งาน / ต่ออายุ ฯลฯ)
   * ค่าเริ่มต้น true เมื่อมีปุ่มยกเลิก — คงพฤติกรรมเดิมของ dialog ลบ
   */
  danger?: boolean;
  /** ไอคอน material หน้าหัวข้อ */
  icon?: string;
  /** ชื่อรายการที่กำลังยืนยัน — แสดงในกล่องแยก */
  subject?: string;
  /** หมายเหตุตัวเล็กใต้ข้อความ */
  note?: string;
  /** ปุ่มเสริม ไม่ปิดกล่อง — เช่น พิมพ์ใบแจ้งลูกค้า */
  extraLabel?: string;
  onExtra?: () => void;
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title class="title" [class.title--icon]="!!data.icon">
      @if (data.icon) {
        <span class="title__icon" [class.title__icon--danger]="isDanger">
          <mat-icon>{{ data.icon }}</mat-icon>
        </span>
      }
      <span>{{ data.title || 'ยืนยันการลบ' }}</span>
    </h2>
    <mat-dialog-content>
      <p class="message">{{ data.message }}</p>
      @if (data.subject) {
        <p class="subject">{{ data.subject }}</p>
      }
      @if (data.note) {
        <p class="note">
          <mat-icon>info</mat-icon>
          <span>{{ data.note }}</span>
        </p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (data.extraLabel) {
        <button mat-stroked-button type="button" (click)="data.onExtra?.()">
          {{ data.extraLabel }}
        </button>
      }
      @if (!data.hideCancel) {
        <button mat-button type="button" mat-dialog-close>
          {{ data.cancelLabel || 'ยกเลิก' }}
        </button>
      }
      <button
        mat-flat-button
        type="button"
        [color]="isDanger ? undefined : 'primary'"
        [class.confirm-danger]="isDanger"
        [mat-dialog-close]="true"
      >
        {{ data.confirmLabel || (data.hideCancel ? 'ปิด' : 'ลบ') }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .title--icon {
      display: flex;
      align-items: center;
      gap: 0.65rem;
    }
    .title__icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: 2.25rem;
      height: 2.25rem;
      border-radius: 999px;
      background: var(--app-accent-soft);
      color: var(--app-accent);
    }
    .title__icon--danger {
      background: var(--app-danger-soft);
      color: var(--app-danger);
    }
    .title__icon mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }
    .message {
      margin: 0;
      line-height: 1.5;
      color: var(--app-text-soft);
      max-width: 28rem;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .subject {
      margin: 0.7rem 0 0;
      padding: 0.6rem 0.8rem;
      border-radius: 10px;
      border: 1px solid var(--app-line, var(--app-line));
      background: var(--app-surface-2);
      color: var(--app-ink);
      font-weight: 600;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }
    .note {
      display: flex;
      align-items: flex-start;
      gap: 0.4rem;
      margin: 0.75rem 0 0;
      color: var(--app-muted);
      font-size: 0.8rem;
      line-height: 1.45;
    }
    .note mat-icon {
      flex-shrink: 0;
      font-size: 16px;
      width: 16px;
      height: 16px;
      margin-top: 0.1rem;
    }
    .confirm-danger {
      --mdc-filled-button-container-color: var(--app-danger);
      --mdc-filled-button-label-text-color: var(--app-on-solid);
      background-color: var(--app-danger) !important;
      color: var(--app-on-solid) !important;
    }
    .confirm-danger:hover {
      --mdc-filled-button-container-color: var(--app-danger);
      background-color: var(--app-danger) !important;
    }
  `,
})
export class ConfirmDialogComponent {
  readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
  readonly isDanger = !this.data.hideCancel && this.data.danger !== false;
}

/** เปิดป๊อปอัปยืนยัน — คืน true เมื่อกดยืนยัน */
export function openConfirmDialog(
  dialog: MatDialog,
  data: ConfirmDialogData
): Observable<boolean> {
  return dialog
    .open(ConfirmDialogComponent, {
      width: data.extraLabel ? '480px' : '400px',
      data,
      autoFocus: 'dialog',
    })
    .afterClosed()
    .pipe(map((ok) => !!ok));
}
