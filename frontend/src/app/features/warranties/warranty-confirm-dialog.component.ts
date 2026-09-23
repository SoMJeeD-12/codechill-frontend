import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface WarrantyConfirmDialogData {
  warrantyCode: string;
  deliveryTitle: string;
  alreadyConfirmed: boolean;
}

@Component({
  selector: 'app-warranty-confirm-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="head">
      <span class="head__icon" aria-hidden="true">
        <mat-icon>verified_user</mat-icon>
      </span>
      <div>
        <h2 mat-dialog-title>ยืนยันการรับประกัน</h2>
        <p class="head__sub">ใช้ประกันที่มีอยู่แล้ว — ไม่ต้องออกใบใหม่</p>
      </div>
    </div>

    <mat-dialog-content>
      <div class="card">
        <div class="card__row">
          <span class="card__label">เลขประกัน</span>
          <strong class="card__value">{{ data.warrantyCode }}</strong>
        </div>
        <div class="card__row">
          <span class="card__label">หลังส่งมอบ</span>
          <strong class="card__value">{{ data.deliveryTitle }}</strong>
        </div>
      </div>

      <p class="ask">
        @if (data.alreadyConfirmed) {
          เคยยืนยันใน session นี้แล้ว — ยืนยันอีกครั้งว่าลูกค้ายังใช้ประกันใบนี้หรือไม่
        } @else {
          ยืนยันว่าลูกค้ายังใช้ประกันใบนี้หลังส่งมอบรอบนี้หรือไม่
        }
      </p>

      <p class="mock-note">
        <mat-icon aria-hidden="true">info</mat-icon>
        บันทึกชั่วคราวในเบราว์เซอร์ · ยังไม่ต่อ API
      </p>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>ปิด</button>
      <button mat-flat-button color="primary" type="button" (click)="confirm()">
        <mat-icon>check</mat-icon>
        ยืนยันประกัน
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    :host {
      display: block;
      min-width: min(26rem, 92vw);
    }

    .head {
      display: flex;
      gap: 0.85rem;
      align-items: flex-start;
      padding: 1.1rem 1.25rem 0.35rem;
    }

    .head__icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 12px;
      background: #f0fdfa;
      color: #0f766e;
      flex: 0 0 auto;

      mat-icon {
        font-size: 1.35rem;
        width: 1.35rem;
        height: 1.35rem;
      }
    }

    h2[mat-dialog-title] {
      margin: 0;
      padding: 0;
      font-size: 1.15rem;
      line-height: 1.3;
      color: #134e4a;
    }

    .head__sub {
      margin: 0.25rem 0 0;
      font-size: 0.86rem;
      color: #64748b;
      line-height: 1.4;
    }

    mat-dialog-content {
      padding: 0.5rem 1.25rem 0.25rem !important;
      margin: 0;
    }

    .card {
      display: grid;
      gap: 0.65rem;
      padding: 0.85rem 1rem;
      border-radius: 12px;
      border: 1px solid rgb(15 118 110 / 0.22);
      background: linear-gradient(180deg, rgb(240 253 250 / 0.95), #fff 70%);
    }

    .card__row {
      display: grid;
      gap: 0.15rem;
    }

    .card__label {
      font-size: 0.75rem;
      letter-spacing: 0.02em;
      color: #64748b;
    }

    .card__value {
      font-size: 0.98rem;
      color: #0f766e;
      font-weight: 700;
      line-height: 1.35;
      word-break: break-word;
    }

    .ask {
      margin: 0.9rem 0 0;
      font-size: 0.92rem;
      line-height: 1.5;
      color: #334155;
    }

    .mock-note {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      margin: 0.75rem 0 0;
      padding: 0.45rem 0.65rem;
      border-radius: 8px;
      background: #f8fafc;
      color: #64748b;
      font-size: 0.78rem;
      line-height: 1.35;

      mat-icon {
        font-size: 1rem;
        width: 1rem;
        height: 1rem;
        color: #94a3b8;
      }
    }

    mat-dialog-actions {
      padding: 0.75rem 1.25rem 1.1rem !important;
      gap: 0.35rem;

      button mat-icon {
        margin-right: 0.15rem;
        font-size: 1.05rem;
        width: 1.05rem;
        height: 1.05rem;
      }
    }
  `,
})
export class WarrantyConfirmDialogComponent {
  private readonly ref = inject(MatDialogRef<WarrantyConfirmDialogComponent, boolean>);
  readonly data = inject<WarrantyConfirmDialogData>(MAT_DIALOG_DATA);

  confirm(): void {
    this.ref.close(true);
  }
}
