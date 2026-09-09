import { DatePipe, Location } from '@angular/common';
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
import { MA_STATUS_LABELS, MaAddon, MaContract } from '../../core/models/ma.model';
import { AuthService } from '../../core/services/auth.service';
import { CustomerService } from '../../core/services/customer.service';
import { MaService } from '../../core/services/ma.service';
import { ProjectService } from '../../core/services/project.service';
import { navigateBack } from '../../core/utils/navigation.util';
import { formatMoneyDisplay } from '../../core/utils/money.util';
import { MoneyInputDirective } from '../../shared/directives/money-input.directive';
import { BahtPipe } from '../../shared/pipes/baht.pipe';

@Component({
  selector: 'app-ma-detail-page',
  standalone: true,
  imports: [
    BahtPipe,
    DatePipe,
    RouterLink,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatSnackBarModule,
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
  readonly addons = signal<MaAddon[]>([]);
  readonly notFound = signal(false);
  readonly statusLabels = MA_STATUS_LABELS;
  readonly addonColumns = ['name', 'qty', 'used', 'price', 'purchasedAt'];

  statusLabel(status: MaContract['status']): string {
    return this.statusLabels[status];
  }

  readonly addonForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    quantity: [1, [Validators.required, Validators.min(1)]],
    unitPrice: [0, Validators.min(0)],
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
    const row = this.api.getById(contractId);
    if (!row) {
      this.notFound.set(true);
      return;
    }
    this.notFound.set(false);
    this.contract.set(row);
    this.addons.set(this.api.getAddons(contractId));
  }

  customerName(id: number): string {
    return this.customersApi.getCustomer(id)?.name ?? `#${id}`;
  }

  projectLabel(id: number | null): string {
    if (!id) {
      return '—';
    }
    const p = this.projectsApi.getProject(id);
    return p ? `${p.code} · ${p.name}` : `#${id}`;
  }

  remaining(): number {
    const c = this.contract();
    return c ? this.api.remainingQuota(c) : 0;
  }

  addAddon(): void {
    const c = this.contract();
    if (!c || this.addonForm.invalid) {
      this.addonForm.markAllAsTouched();
      return;
    }
    const raw = this.addonForm.getRawValue();
    this.api
      .addAddon(c.id, {
        name: raw.name,
        quantity: Number(raw.quantity),
        unitPrice: Number(raw.unitPrice) || 0,
      })
      .subscribe({
        next: () => {
          this.snack.open('เพิ่ม Add-on แล้ว', 'ปิด', { duration: 2500 });
          this.addonForm.reset({ name: '', quantity: 1, unitPrice: 0 });
          this.reload();
        },
        error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 3500 }),
      });
  }

  printInvoice(): void {
    const c = this.contract();
    if (!c) {
      return;
    }
    const customer = this.customerName(c.customerId);
    const user = this.auth.currentUser()?.fullName ?? 'ระบบ';
    const addonLines = this.addons()
      .map(
        (a) =>
          `<tr><td>${a.name}</td><td>${a.quantity}</td><td>${formatMoneyDisplay(a.unitPrice)}</td><td>${formatMoneyDisplay(
            a.quantity * a.unitPrice
          )}</td></tr>`
        )
        .join('');
    const addonTotal = this.addons().reduce((sum, a) => sum + a.quantity * a.unitPrice, 0);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ใบแจ้งค่าบริการ ${c.contractNo}</title>
<style>
body{font-family:Sarabun,sans-serif;padding:32px;color:#1c2b28}
h1{margin:0 0 4px;font-size:1.4rem} .muted{color:#5b6762}
table{width:100%;border-collapse:collapse;margin-top:1.25rem}
th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left}
.total{margin-top:1rem;font-size:1.1rem;font-weight:700}
@media print{button{display:none}}
</style></head><body>
<p class="muted">CPAMS · ใบแจ้งค่าบริการ</p>
<h1>${c.contractNo} · ${c.planName}</h1>
<p>ลูกค้า: ${customer}<br>ระยะสัญญา: ${c.startDate} – ${c.endDate}<br>พิมพ์โดย: ${user}</p>
<table>
<thead><tr><th>รายการ</th><th>จำนวน</th><th>ราคา/หน่วย</th><th>รวม</th></tr></thead>
<tbody>
<tr><td>ค่าบริการ MA ประจำปี</td><td>1</td><td>${formatMoneyDisplay(c.annualFee)}</td><td>${formatMoneyDisplay(c.annualFee)}</td></tr>
${addonLines}
</tbody></table>
<p class="total">รวมทั้งสิ้น ${formatMoneyDisplay(c.annualFee + addonTotal)} บาท</p>
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
