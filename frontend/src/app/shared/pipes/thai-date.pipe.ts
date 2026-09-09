import { Pipe, PipeTransform } from '@angular/core';
import { formatThaiDate, formatThaiDateTime, formatThaiTime } from '../../core/utils/date.util';

/**
 * แสดงวัน/เวลาแบบไทย
 * - 'datetime' (ค่าเริ่มต้น): 9 ก.ย. 2026 15.30 น.
 * - 'date': 9 ก.ย. 2026
 * - 'time': 15.30 น.
 */
@Pipe({ name: 'thaiDate', standalone: true })
export class ThaiDatePipe implements PipeTransform {
  transform(
    value: Date | string | null | undefined,
    mode: 'datetime' | 'date' | 'time' = 'datetime',
    empty = '—'
  ): string {
    if (value == null || value === '') {
      return empty;
    }
    const formatted =
      mode === 'time'
        ? formatThaiTime(value)
        : mode === 'date'
          ? formatThaiDate(value)
          : formatThaiDateTime(value);
    return formatted || empty;
  }
}
