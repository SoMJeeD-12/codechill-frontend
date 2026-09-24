import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { apiErrorMessage } from '../../core/http/api-error';
import { ApiEnvelopeService } from '../../core/http/api-envelope.service';

const SUCCESS_MS = 3500;
const ERROR_MS = 4500;

/**
 * Toast ชนิด A — หลัง action ของตัวเอง (สำเร็จ/ผิดพลาด)
 * ไม่ใช่การ์ด inbox ชนิด B
 */
@Injectable({ providedIn: 'root' })
export class ApiToastService {
  private readonly snack = inject(MatSnackBar);
  private readonly envelope = inject(ApiEnvelopeService);

  success(message: string, duration = SUCCESS_MS): void {
    const text = message?.trim();
    if (!text) {
      return;
    }
    this.snack.open(text, 'ปิด', {
      duration,
      horizontalPosition: 'end',
      verticalPosition: 'bottom',
      panelClass: ['app-toast', 'app-toast--success'],
    });
  }

  /** แสดง message จากซอง success ล่าสุด (ถ้ามี) */
  successFromEnvelope(fallback?: string, duration = SUCCESS_MS): void {
    const fromApi = this.envelope.takeMessage();
    this.success(fromApi || fallback || '', duration);
  }

  /** แสดง message ไทยจาก error envelope ตรง ๆ */
  error(err: unknown, fallback = 'เกิดข้อผิดพลาด', duration = ERROR_MS): void {
    this.snack.open(apiErrorMessage(err, fallback), 'ปิด', {
      duration,
      horizontalPosition: 'end',
      verticalPosition: 'bottom',
      panelClass: ['app-toast', 'app-toast--error'],
    });
  }

  info(message: string, duration = SUCCESS_MS): void {
    const text = message?.trim();
    if (!text) {
      return;
    }
    this.snack.open(text, 'ปิด', {
      duration,
      horizontalPosition: 'end',
      verticalPosition: 'bottom',
      panelClass: ['app-toast', 'app-toast--info'],
    });
  }
}
