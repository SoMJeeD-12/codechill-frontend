import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  CUSTOMER_STATUS_LABELS,
  Contact,
  Customer,
} from '../../core/models/customer.model';
import { CustomerService } from '../../core/services/customer.service';

export interface CustomerPreviewDialogData {
  customerId: number;
  /** แถวจากรายการ — โชว์ทันทีระหว่างโหลดเต็ม */
  seed?: Customer | null;
}

/**
 * การ์ดป๊อปอัปทะเบียนลูกค้าเท่านั้น (ชื่อ ภาษี ที่อยู่ ผู้ติดต่อ)
 * โปรเจกต์ / ประกัน / MA / ปัญหา / ติดตาม ไปที่มุมมอง 360°
 */
@Component({
  selector: 'app-customer-preview-dialog',
  standalone: true,
  imports: [
    RouterLink,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <h2 mat-dialog-title>รายละเอียดลูกค้า</h2>
    <mat-dialog-content>
      @if (loading()) {
        <div class="loading">
          <mat-spinner diameter="36" />
        </div>
      } @else {
        @if (customer(); as c) {
          <article class="preview-card">
            <header class="preview-card__head">
              <h3>{{ c.name }}</h3>
              <p class="meta">
                รหัส {{ c.code || '—' }} · {{ statusLabel(c.status) }}
              </p>
            </header>

            <dl class="preview-card__grid">
              <div>
                <dt>เลขผู้เสียภาษี</dt>
                <dd>{{ c.taxId || '—' }}</dd>
              </div>
              <div>
                <dt>โทรศัพท์</dt>
                <dd>{{ c.phone || '—' }}</dd>
              </div>
              <div>
                <dt>อีเมล</dt>
                <dd>{{ c.email || '—' }}</dd>
              </div>
              <div>
                <dt>ผู้ดูแล</dt>
                <dd>{{ c.owner?.fullName || '—' }}</dd>
              </div>
              <div class="full">
                <dt>ที่อยู่</dt>
                <dd>{{ c.address || '—' }}</dd>
              </div>
              <div>
                <dt>LINE Official</dt>
                <dd>{{ c.lineOfficialId || '—' }}</dd>
              </div>
              <div>
                <dt>Facebook</dt>
                <dd>{{ c.facebookUrl || '—' }}</dd>
              </div>
              <div class="full">
                <dt>หมายเหตุ</dt>
                <dd>{{ c.note || '—' }}</dd>
              </div>
            </dl>

            <section class="preview-card__contacts">
              <h4>ผู้ติดต่อ</h4>
              @if (contacts().length === 0) {
                <p class="empty">ยังไม่มีผู้ติดต่อ</p>
              } @else {
                <ul>
                  @for (p of contacts(); track p.id) {
                    <li>
                      <strong>{{ p.name }}</strong>
                      @if (p.isPrimary) {
                        <span class="primary">หลัก</span>
                      }
                      <span class="sub">
                        {{ p.position || '—' }} · {{ p.phone || '—' }} · {{ p.email || '—' }}
                      </span>
                    </li>
                  }
                </ul>
              }
            </section>
          </article>
        } @else {
          <p class="empty">โหลดข้อมูลลูกค้าไม่สำเร็จ</p>
        }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>ปิด</button>
      @if (customer(); as c) {
        <a
          mat-stroked-button
          color="primary"
          [routerLink]="['/app/customer-360', c.id]"
          (click)="ref.close()"
        >
          <mat-icon>travel_explore</mat-icon>
          ดูมุมมอง 360°
        </a>
      }
    </mat-dialog-actions>
  `,
  styles: `
    .loading {
      display: grid;
      place-items: center;
      min-height: 8rem;
    }
    .preview-card__head {
      margin-bottom: 0.85rem;
      h3 {
        margin: 0;
        font-size: 1.2rem;
      }
      .meta {
        margin: 0.25rem 0 0;
        color: var(--app-muted);
        font-size: 0.88rem;
      }
    }
    .preview-card__grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.65rem 1rem;
      margin: 0 0 1rem;
      padding: 0.85rem 0.95rem;
      border-radius: 12px;
      background: var(--app-surface-2);
      border: 1px solid color-mix(in srgb, var(--app-ink) 6%, transparent);
      div {
        min-width: 0;
      }
      .full {
        grid-column: 1 / -1;
      }
      dt {
        margin: 0;
        font-size: 0.75rem;
        color: var(--app-muted);
      }
      dd {
        margin: 0.15rem 0 0;
        font-size: 0.92rem;
        word-break: break-word;
      }
    }
    .preview-card__contacts {
      h4 {
        margin: 0 0 0.45rem;
        font-size: 0.95rem;
      }
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 0.45rem;
      }
      li {
        display: grid;
        gap: 0.1rem;
        padding: 0.55rem 0.65rem;
        border-radius: 10px;
        border: 1px solid color-mix(in srgb, var(--app-ink) 6%, transparent);
        background: var(--app-surface);
      }
      .primary {
        display: inline-block;
        margin-left: 0.35rem;
        padding: 0.05rem 0.4rem;
        border-radius: 999px;
        font-size: 0.72rem;
        font-weight: 700;
        color: var(--app-accent);
        background: var(--app-accent-soft);
      }
      .sub {
        color: var(--app-muted);
        font-size: 0.82rem;
      }
    }
    .empty {
      margin: 0;
      color: var(--app-muted);
      font-size: 0.9rem;
    }
    mat-dialog-actions a mat-icon {
      margin-right: 0.25rem;
      font-size: 1.1rem;
      width: 1.1rem;
      height: 1.1rem;
      vertical-align: middle;
    }
    @media (max-width: 560px) {
      .preview-card__grid {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class CustomerPreviewDialogComponent {
  readonly ref = inject(MatDialogRef<CustomerPreviewDialogComponent>);
  private readonly api = inject(CustomerService);
  readonly data = inject<CustomerPreviewDialogData>(MAT_DIALOG_DATA);

  readonly loading = signal(true);
  readonly customer = signal<Customer | null>(this.data.seed ?? null);
  readonly contacts = signal<Contact[]>([]);
  private readonly statusLabels = CUSTOMER_STATUS_LABELS;

  constructor() {
    const seed = this.data.seed;
    if (seed?.contacts?.length) {
      this.contacts.set(seed.contacts);
    }
    this.api.fetchCustomer(this.data.customerId).subscribe({
      next: (c) => {
        this.customer.set(c);
        this.contacts.set(c.contacts?.length ? c.contacts : []);
        this.loading.set(false);
        if (!c.contacts?.length) {
          this.api.listContacts(c.id).subscribe({
            next: (rows) => this.contacts.set(rows),
            error: () => undefined,
          });
        }
      },
      error: () => {
        if (!this.customer()) {
          this.customer.set(null);
        }
        this.loading.set(false);
      },
    });
  }

  statusLabel(status: Customer['status']): string {
    return this.statusLabels[status] ?? status;
  }
}
