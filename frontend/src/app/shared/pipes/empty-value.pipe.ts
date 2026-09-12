import { Pipe, PipeTransform } from '@angular/core';

/**
 * ค่าที่ยังไม่กรอก
 * - โหมด default: แสดง "—"
 * - โหมด unset: ชั่วโมง/ค่าบริการ แสดง "ยังไม่กรอก" ห้ามโชว์ 0
 */
@Pipe({ name: 'emptyValue', standalone: true })
export class EmptyValuePipe implements PipeTransform {
  transform(
    value: string | number | null | undefined,
    mode: 'dash' | 'unset' = 'dash'
  ): string {
    if (value === null || value === undefined || value === '') {
      return mode === 'unset' ? 'ยังไม่กรอก' : '—';
    }
    if (mode === 'unset' && (value === 0 || value === '0' || value === '0.00')) {
      return 'ยังไม่กรอก';
    }
    return String(value);
  }
}
