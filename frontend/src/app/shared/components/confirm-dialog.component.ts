import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
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
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.title || 'ยืนยันการลบ' }}</h2>
    <mat-dialog-content>
      <p class="message">{{ data.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>
        {{ data.cancelLabel || 'ยกเลิก' }}
      </button>
      <button
        mat-flat-button
        type="button"
        class="confirm-danger"
        [mat-dialog-close]="true"
      >
        {{ data.confirmLabel || 'ลบ' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .message {
      margin: 0;
      line-height: 1.5;
      color: #334155;
      max-width: 28rem;
      white-space: pre-wrap;
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
