import { Location } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  MA_BILLING_CYCLE_LABELS,
  MA_STATUS_LABELS,
  MaAddon,
  MaContract,
  MaQuotaStatus,
  maPlanDisplayName,
  maSlaHours,
} from '../../core/models/ma.model';
import { AuthService } from '../../core/services/auth.service';
import { CustomerService } from '../../core/services/customer.service';
import { MaService } from '../../core/services/ma.service';
import { ProjectService } from '../../core/services/project.service';
import { navigateBack } from '../../core/utils/navigation.util';
import { formatMoneyDisplay, parseMoneyValue, toMoneyString } from '../../core/utils/money.util';
import { MoneyInputDirective } from '../../shared/directives/money-input.directive';
import { BahtPipe } from '../../shared/pipes/baht.pipe';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';

@Component({
  selector: 'app-ma-detail-page',
  standalone: true,
  imports: [
    ThaiDatePipe,
    BahtPipe,
    RouterLink,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatSnackBarModule,
    MatTooltipModule,
    MoneyInputDirective,
  ],
  templateUrl: './ma-detail-page.component.html',
  styleUrl: './ma-detail-page.component.scss',
})
export class MaDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly api = inject(MaService);
  private readonly customersApi = inject(CustomerService);
  private readonly projectsApi = inject(ProjectService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly snack = inject(MatSnackBar);

  readonly contract = signal<MaContract | null>(null);
  readonly quota = signal<MaQuotaStatus | null>(null);
  readonly addons = signal<MaAddon[]>([]);
  readonly notFound = signal(false);
  readonly savingAddon = signal(false);
  readonly statusLabels = MA_STATUS_LABELS;
  readonly billingLabels = MA_BILLING_CYCLE_LABELS;
  readonly addonColumns = ['title', 'extraQuota', 'price', 'effective', 'createdAt'];

  statusLabel(status: MaContract['status']): string {
    return this.statusLabels[status];
  }

  readonly addonForm = this.fb.nonNullable.group({
    title: ['', Validators.required],
    extraQuota: [1, [Validators.required, Validators.min(0)]],
    price: [0, Validators.min(0)],
  });

  goBack(): void {
    navigateBack(this.location, this.router, '/app/ma');
  }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.reload(id);
  }

  reload(id?: number): void {
    const contractId = id ?? this.contract()?.id;
    if (!contractId) {
      return;
    }
    this.api.get(contractId).subscribe({
      next: (row) => {
        this.notFound.set(false);
        this.contract.set(row);
        this.quota.set(row.quota ?? null);
        if (!row.quota) {
          this.api.getQuota(contractId).subscribe({
            next: (q) => this.quota.set(q),
            error: () => undefined,
          });
        }
        this.api.listAddons(contractId).subscribe({
          next: (addons) => this.addons.set(addons),
          error: () => this.addons.set(row.addons ?? []),
        });
      },
      error: () => this.notFound.set(true),
    });
  }

  customerName(c: MaContract): string {
    return c.customerName ?? this.customersApi.getCustomer(c.customerId)?.name ?? `#${c.customerId}`;
  }

  projectLabel(c: MaContract): string {
    if (c.projectName) {
      return c.projectName;
    }
    const p = this.projectsApi.getProject(c.projectId);
    return p ? `${p.code} · ${p.name}` : `#${c.projectId}`;
  }

  planName(c: MaContract): string {
    return maPlanDisplayName(c);
  }

  slaLabel(c: MaContract): string {
    const hours = maSlaHours(c);
    return hours != null ? `SLA ${hours} ชม.` : 'ไม่มี SLA';
  }

  remaining(): number {
    return this.quota()?.remaining ?? this.api.remainingQuota(this.contract()!);
  }

  saveAddon(): void {
    const c = this.contract();
    if (!c || this.addonForm.invalid) {
      this.addonForm.markAllAsTouched();
      return;
    }
    const raw = this.addonForm.getRawValue();
    const payload = {
      title: raw.title.trim(),
      addonType: 'EXTRA_QUOTA' as const,
      extraQuota: Number(raw.extraQuota) || 0,
      price: toMoneyString(raw.price),
    };
    this.savingAddon.set(true);

    this.api.addAddon(c.id, payload).subscribe({
      next: () => {
        this.savingAddon.set(false);
        this.snack.open('เพิ่ม Add-on แล้ว', 'ปิด', { duration: 2500 });
        this.addonForm.reset({ title: '', extraQuota: 1, price: 0 });
        this.reload();
      },
      error: (err: Error) => {
        this.savingAddon.set(false);
        this.snack.open(err.message, 'ปิด', { duration: 4000 });
      },
    });
  }

  printInvoice(): void {
    const c = this.contract();
    if (!c) {
      return;
    }
    const customer = this.customerName(c);
    const user = this.auth.currentUser()?.fullName ?? 'ระบบ';
    const addonLines = this.addons()
      .map(
        (a) =>
          `<tr><td>${a.title}</td><td>1</td><td>${formatMoneyDisplay(a.price)}</td><td>${formatMoneyDisplay(
            a.price
          )}</td></tr>`
      )
      .join('');
    const addonTotal = this.addons().reduce((sum, a) => sum + (parseMoneyValue(a.price) ?? 0), 0);
    const fee = parseMoneyValue(c.price) ?? 0;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ใบแจ้งค่าบริการ ${c.contractNo || c.id}</title>
<style>
body{font-family:Sarabun,sans-serif;padding:32px;color:#1c2b28}
h1{margin:0 0 4px;font-size:1.4rem} .muted{color:#5b6762}
table{width:100%;border-collapse:collapse;margin-top:1.25rem}
th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left}
.total{margin-top:1rem;font-size:1.1rem;font-weight:700}
@media print{button{display:none}}
</style></head><body>
<p class="muted">CPAMS · ใบแจ้งค่าบริการ</p>
<h1>${c.contractNo || '#' + c.id} · ${this.planName(c)}</h1>
<p>ลูกค้า: ${customer}<br>ระยะสัญญา: ${c.startDate} – ${c.endDate}<br>พิมพ์โดย: ${user}</p>
<table>
<thead><tr><th>รายการ</th><th>จำนวน</th><th>ราคา/หน่วย</th><th>รวม</th></tr></thead>
<tbody>
<tr><td>ค่าบริการ MA (${this.billingLabels[c.billingCycle]})</td><td>1</td><td>${formatMoneyDisplay(c.price)}</td><td>${formatMoneyDisplay(c.price)}</td></tr>
${addonLines}
</tbody></table>
<p class="total">รวมทั้งสิ้น ${formatMoneyDisplay(fee + addonTotal)} บาท</p>
<p class="muted">เอกสารจำลองสำหรับพรีวิว — ไม่ใช่ใบกำกับภาษีจริง</p>
<button onclick="window.print()">พิมพ์</button>
</body></html>`;
    const win = window.open('', '_blank', 'width=800,height=900');
    if (!win) {
      this.snack.open('เบราว์เซอร์บล็อกหน้าต่างพิมพ์', 'ปิด', { duration: 3000 });
      return;
    }
    win.document.write(html);
    win.document.close();
  }
}
