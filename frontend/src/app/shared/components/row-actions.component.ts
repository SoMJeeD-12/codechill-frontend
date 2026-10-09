import { Component, computed, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';

/** การกระทำในแถวตาราง — primary โชว์เป็นปุ่มหลัก ที่เหลือเป็นปุ่มรองหรือเมนู ⋯ */
export interface RowAction {
  label: string;
  icon?: string;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  run: () => void;
}

@Component({
  selector: 'app-row-actions',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatMenuModule],
  template: `
    <div class="row-actions">
      @if (primary(); as action) {
        <button
          mat-flat-button
          color="primary"
          type="button"
          class="row-action row-action--primary"
          [disabled]="!!action.disabled"
          (click)="action.run()"
        >
          {{ action.label }}
        </button>
      }
      @for (action of inlineSecondary(); track action.label) {
        <button
          mat-stroked-button
          type="button"
          class="row-action row-action--secondary"
          [disabled]="!!action.disabled"
          (click)="action.run()"
        >
          {{ action.label }}
        </button>
      }
      @if (menuActions().length) {
        <button
          mat-icon-button
          type="button"
          class="row-action row-action--more"
          [class.is-compact]="inlineSecondary().length > 0"
          [matMenuTriggerFor]="moreMenu"
          aria-label="การกระทำเพิ่มเติม"
        >
          <mat-icon>more_horiz</mat-icon>
        </button>
        <mat-menu #moreMenu="matMenu">
          @for (action of menuActions(); track action.label) {
            <button
              mat-menu-item
              type="button"
              [disabled]="!!action.disabled"
              [class.menu-danger]="action.danger"
              (click)="action.run()"
            >
              @if (action.icon) {
                <mat-icon>{{ action.icon }}</mat-icon>
              }
              <span>{{ action.label }}</span>
            </button>
          }
        </mat-menu>
      }
      @if (allActions().length) {
        <button
          mat-icon-button
          type="button"
          class="row-action row-action--more row-action--all"
          [matMenuTriggerFor]="allMenu"
          aria-label="การกระทำ"
        >
          <mat-icon>more_horiz</mat-icon>
        </button>
        <mat-menu #allMenu="matMenu">
          @for (action of allActions(); track action.label) {
            <button
              mat-menu-item
              type="button"
              [disabled]="!!action.disabled"
              [class.menu-danger]="action.danger"
              (click)="action.run()"
            >
              @if (action.icon) {
                <mat-icon>{{ action.icon }}</mat-icon>
              }
              <span>{{ action.label }}</span>
            </button>
          }
        </mat-menu>
      }
    </div>
  `,
})
export class RowActionsComponent {
  readonly actions = input<RowAction[]>([]);
  /** ตารางคอลัมน์แน่น — โชว์เฉพาะปุ่มหลัก ที่เหลือเข้าเมนู ⋯ */
  readonly compact = input(false);

  readonly primary = computed(() => {
    const list = this.actions().filter((action) => action.label);
    return list.find((action) => action.primary) ?? list[0] ?? null;
  });

  readonly rest = computed(() => {
    const main = this.primary();
    return this.actions().filter((action) => action !== main && action.label);
  });

  /** เหลือ 1 ตัวโชว์คู่ปุ่มหลัก เกินนั้นหรือโหมดกะทัดรัดเข้าเมนู ⋯ */
  readonly inlineSecondary = computed(() =>
    this.compact() || this.rest().length !== 1 ? [] : this.rest(),
  );

  readonly menuActions = computed(() => this.rest());

  /** จอมือถือ — ทุกคำสั่งรวมในปุ่ม ⋯ ปุ่มเดียว (สลับด้วย CSS ใน _list-panel.scss) */
  readonly allActions = computed(() => {
    const main = this.primary();
    return main ? [main, ...this.rest()] : this.rest();
  });
}
