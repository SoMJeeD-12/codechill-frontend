import { Pipe, PipeTransform } from '@angular/core';
import { formatMoneyDisplay } from '../../core/utils/money.util';

/** แสดงตัวเลขเงินพร้อมคอมม่า เช่น 1200000 → ฿1,200,000 */
@Pipe({ name: 'baht', standalone: true })
export class BahtPipe implements PipeTransform {
  transform(value: number | string | null | undefined, empty = '—'): string {
    if (value === null || value === undefined || value === '') {
      return empty;
    }
    const formatted = formatMoneyDisplay(value);
    return formatted ? `฿${formatted}` : empty;
  }
}
