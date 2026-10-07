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
      background: #e7f3f0;
      color: #0f766e;
    }
    .title__icon--danger {
      background: #fee2e2;
      color: #dc2626;
    }
    .title__icon mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }
    .message {
      margin: 0;
      line-height: 1.5;
      color: #334155;
      max-width: 28rem;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .subject {
      margin: 0.7rem 0 0;
      padding: 0.6rem 0.8rem;
      border-radius: 10px;
      border: 1px solid var(--app-line, #e2e8f0);
      background: #f8fafc;
      color: #1c2b28;
      font-weight: 600;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }
    .note {
      display: flex;
      align-items: flex-start;
      gap: 0.4rem;
      margin: 0.75rem 0 0;
      color: #7b8a85;
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
      --mdc-filled-button-container-color: #dc2626;
      --mdc-filled-button-label-text-color: #fff;
      background-color: #dc2626 !important;
      color: #fff !important;
    }
    .confirm-danger:hover {
      --mdc-filled-button-container-color: #b91c1c;
      background-color: #b91c1c !important;
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
      width: '400px',
      data,
      autoFocus: 'dialog',
    })
    .afterClosed()
    .pipe(map((ok) => !!ok));
}
