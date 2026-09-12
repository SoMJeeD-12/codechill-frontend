import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { apiErrorMessage } from '../../core/http/api-error';
import { ApiEnvelopeService } from '../../core/http/api-envelope.service';

/**
 * Toast จาก message ของ API — ห้ามกลืนเงียบ
 * ใช้แทนการเรียก snack.open(err.message) กระจัดกระจาย
 */
@Injectable({ providedIn: 'root' })
export class ApiToastService {
  private readonly snack = inject(MatSnackBar);
  private readonly envelope = inject(ApiEnvelopeService);

  success(message: string, duration = 2500): void {
    const text = message?.trim();
    if (!text) {
      return;
    }
    this.snack.open(text, 'ปิด', { duration });
  }

  /** แสดง message จากซอง success ล่าสุด (ถ้ามี) */
  successFromEnvelope(fallback?: string, duration = 2500): void {
    const fromApi = this.envelope.takeMessage();
    this.success(fromApi || fallback || '', duration);
  }

  /** แสดง message ไทยจาก error envelope ตรง ๆ */
  error(err: unknown, fallback = 'เกิดข้อผิดพลาด', duration = 4000): void {
    this.snack.open(apiErrorMessage(err, fallback), 'ปิด', { duration });
  }

  info(message: string, duration = 3000): void {
    this.success(message, duration);
  }
}
