import { Component, input } from '@angular/core';

/**
 * แสดงรหัส (code / ticketNo ฯลฯ)
 * ค่าว่าง → "—" ตาม brief — ห้ามเว้นว่างเงียบ
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
    const raw = this.value();
    if (raw == null || String(raw).trim() === '') {
      return this.empty();
    }
    return String(raw).trim();
  }
}
