import { Component, input } from '@angular/core';
import { displayEntityCode } from '../../core/utils/entity-code.util';

/**
 * แสดงรหัส (code / ticketNo / contractNo / deliveryNo ฯลฯ)
 * แสดงตามค่าที่ API ส่งมา — รองรับทั้งรูปแบบสั้น (TK69-0006) และรหัสเก่า (PRJ-2026-001)
 * ค่าว่างหรือ null → "—" · ห้ามออกรหัสฝั่ง FE
 */
@Component({
  selector: 'app-code-label',
  standalone: true,
  template: `<span class="col-code">{{ display() }}</span>`,
  styles: [
    `
      .col-code {
        font-family: ui-monospace, 'Cascadia Mono', 'Segoe UI Mono', monospace;
        font-size: 0.86rem;
        letter-spacing: 0.01em;
        white-space: nowrap;
      }
    `,
  ],
})
export class CodeLabelComponent {
  readonly value = input<string | null | undefined>(null);
  readonly empty = input('—');

  display(): string {
    return displayEntityCode(this.value(), this.empty());
  }
}
