import { Component, input } from '@angular/core';

/**
 * แถบสถานะหนึ่งแถบ — ข้อมูลสำคัญอยู่บนสุด
 * ใช้กับใบแจ้งปัญหา / โปรเจกต์ (ไม่ซ้อนกับตาราง)
 */
@Component({
  selector: 'app-status-bar',
  standalone: true,
  template: `
    <div class="status-bar" [attr.data-status]="status()">
      <span class="status-bar__now">{{ label() }}</span>
      @if (detail(); as d) {
        <span class="status-bar__detail">{{ d }}</span>
      }
      @if (owner(); as o) {
        <span class="status-bar__owner">{{ o }}</span>
      }
      <ng-content />
    </div>
  `,
  styleUrl: './status-bar.component.scss',
})
export class StatusBarComponent {
  /** ค่าสถานะดิบสำหรับ data-status (สี) */
  readonly status = input<string>('');
  /** ข้อความสถานะที่แสดง */
  readonly label = input.required<string>();
  readonly detail = input<string | null>(null);
  readonly owner = input<string | null>(null);
}
