import { Injectable, NgZone, inject } from '@angular/core';

/** ต้องตรงกับ @media โหมดการ์ดใน styles/_list-panel.scss */
const CARD_QUERY = '(max-width: 640px)';

/**
 * โหมดการ์ดบนมือถือ — ใส่ data-label (ชื่อหัวคอลัมน์) ให้ทุกเซลล์ของ table.data-table
 * CSS ใช้ attr(data-label) เป็นชื่อบรรทัดในการ์ด · ตารางทุกหน้าได้ผลโดยไม่ต้องแก้ template
 */
@Injectable({ providedIn: 'root' })
export class TableCardLabelsService {
  private readonly zone = inject(NgZone);
  private observer: MutationObserver | null = null;
  private scheduled = false;
  private media: MediaQueryList | null = null;

  start(): void {
    if (this.observer || typeof MutationObserver === 'undefined') {
      return;
    }
    this.zone.runOutsideAngular(() => {
      this.media = window.matchMedia(CARD_QUERY);
      this.media.addEventListener('change', () => this.schedule());
      this.observer = new MutationObserver(() => this.schedule());
      this.observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      this.schedule();
    });
  }

  private schedule(): void {
    if (this.scheduled || !this.media?.matches) {
      return;
    }
    this.scheduled = true;
    requestAnimationFrame(() => {
      this.scheduled = false;
      document
        .querySelectorAll<HTMLTableElement>('table.data-table')
        .forEach((table) => this.labelTable(table));
    });
  }

  private labelTable(table: HTMLTableElement): void {
    const labels = new Map<string, string>();
    table.querySelectorAll<HTMLElement>('th.mat-mdc-header-cell').forEach((th) => {
      const col = columnClass(th);
      if (col) {
        labels.set(col, headerText(th));
      }
    });
    table.querySelectorAll<HTMLElement>('td.mat-mdc-cell').forEach((td) => {
      const col = columnClass(td);
      if (!col) {
        return;
      }
      const label = labels.get(col) ?? '';
      if (td.getAttribute('data-label') !== label) {
        td.setAttribute('data-label', label);
      }
    });
  }
}

function columnClass(el: Element): string | null {
  for (const c of Array.from(el.classList)) {
    if (c.startsWith('mat-column-')) {
      return c;
    }
  }
  return null;
}

/** ข้อความหัวคอลัมน์ — ตัดชื่อไอคอน (ligature เช่น arrow_upward) ของปุ่มเรียงลำดับออก */
function headerText(th: HTMLElement): string {
  const clone = th.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('mat-icon, .mat-icon').forEach((icon) => icon.remove());
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}
