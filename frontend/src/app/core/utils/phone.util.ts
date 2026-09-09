import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * เบอร์ไทย:
 * - มือถือ 10 หลัก: 06x / 08x / 09x (เช่น 0921234567)
 * - บ้าน/สำนักงาน 9 หลัก: 02–07 (เช่น 021234567)
 */
export const THAI_PHONE_PATTERN = /^0([689]\d{8}|[2-7]\d{7})$/;

export function sanitizePhoneDigits(raw: string | null | undefined): string {
  return String(raw ?? '')
    .replace(/\D/g, '')
    .slice(0, 10);
}

export function isValidThaiPhone(raw: string | null | undefined): boolean {
  const digits = sanitizePhoneDigits(raw);
  return THAI_PHONE_PATTERN.test(digits);
}

/** ว่างได้ — ถ้ามีค่าต้องเป็นเบอร์ไทยที่ถูกต้อง */
export const thaiPhoneValidator: ValidatorFn = (
  control: AbstractControl
): ValidationErrors | null => {
  const raw = (control.value ?? '').toString().trim();
  if (!raw) {
    return null;
  }
  return isValidThaiPhone(raw) ? null : { thaiPhone: true };
};
