import { Injectable } from '@angular/core';

/**
 * เก็บ message จากซอง { success, data, message } หลัง unwrap
 * ใช้เมื่อ create ฯลฯ อาจคืนคำเตือนใน message ทั้งที่ success = true
 */
@Injectable({ providedIn: 'root' })
export class ApiEnvelopeService {
  private message: string | null = null;

  setMessage(message: string | null | undefined): void {
    const trimmed = message?.trim();
    this.message = trimmed ? trimmed : null;
  }

  /** อ่านแล้วล้าง */
  takeMessage(): string | null {
    const next = this.message;
    this.message = null;
    return next;
  }
}
