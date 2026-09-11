import { Location } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
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
import { MaContractPrintPayload, MaService } from '../../core/services/ma.service';
import { ProjectService } from '../../core/services/project.service';
import { parseDateOnly, toDateOnlyString } from '../../core/utils/date.util';
import { navigateBack } from '../../core/utils/navigation.util';
import { formatMoneyDisplay, parseMoneyValue, toMoneyString } from '../../core/utils/money.util';
import { openConfirmDialog } from '../../shared/components/confirm-dialog.component';
import { MoneyInputDirective } from '../../shared/directives/money-input.directive';
import { BahtPipe } from '../../shared/pipes/baht.pipe';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { createClientPager } from '../../shared/utils/client-pager';

/** ค่า placeholder สำหรับหน้าพิมพ์ร่างสัญญา (แก้ที่ FE) */
const COMPANY_PRINT = {
  name: 'ชื่อบริษัทเรา',
  address: 'ที่อยู่',
  taxId: 'เลขผู้เสียภาษี',
} as const;

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
    MatDialogModule,
    MoneyInputDirective,
    TablePaginatorComponent,
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
  private readonly dialog = inject(MatDialog);

  readonly contract = signal<MaContract | null>(null);
  readonly quota = signal<MaQuotaStatus | null>(null);
  readonly addons = signal<MaAddon[]>([]);
  readonly addonsPager = createClientPager(this.addons);
  readonly notFound = signal(false);
  readonly savingAddon = signal(false);
  readonly renewing = signal(false);
  readonly activating = signal(false);
  readonly statusLabels = MA_STATUS_LABELS;
  readonly billingLabels = MA_BILLING_CYCLE_LABELS;
  readonly addonColumns = ['title', 'extraQuota', 'price', 'effective', 'createdAt'];

  readonly canRenew = computed(
    () =>
      this.auth.hasPermissionCode('ma.renew') || this.auth.hasPermissionCode('ma.update')
  );

  readonly canActivate = computed(() => {
    const c = this.contract();
    if (!c || c.status !== 'DRAFT') {
      return false;
    }
    return (
      this.auth.hasPermissionCode('ma.update') || this.auth.hasPermission('ma', 'update')
    );
  });

  readonly planQuota = computed(
    () => this.contract()?.plan?.bugQuotaPerMonth ?? 0
  );

  readonly addonQuota = computed(() =>
    this.addons()
      .filter((a) => a.addonType === 'EXTRA_QUOTA')
      .reduce((sum, a) => sum + (Number(a.extraQuota) || 0), 0)
  );

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
        this.api.getQuota(contractId).subscribe({
          next: (q) => this.quota.set(q),
          error: () => this.quota.set(row.quota ?? null),
        });
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
    return p ? p.name : `#${c.projectId}`;
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

  printDraftContract(): void {
    const c = this.contract();
    if (!c) {
      return;
    }
    this.api.getPrintPayload(c.id).subscribe({
      next: (payload) => this.openPrintWindow(this.buildDraftHtml(payload), 'ร่างสัญญา'),
      error: (err: Error) => this.snack.open(err.message, 'ปิด', { duration: 4000 }),
    });
  }

  activateContract(): void {
    const c = this.contract();
    if (!c || !this.canActivate() || this.activating()) {
      return;
    }
    const signedToday = !c.signedDate;
    const lines = [
      'เปลี่ยนสถานะจาก「แบบร่าง」เป็น「ใช้งาน」',
      'หลังเริ่มใช้งาน ระบบจะหักโควตาจากใบปัญหาได้',
    ];
    if (signedToday) {
      lines.push('ยังไม่มีวันที่เซ็น — จะบันทึกเป็นวันนี้ (BR-12)');
    }
    openConfirmDialog(this.dialog, {
      title: 'เริ่มใช้งานสัญญา MA',
      message: lines.join('\n'),
      confirmLabel: 'เริ่มใช้งาน',
      danger: false,
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.activating.set(true);
      this.api
        .update(c.id, {
          status: 'ACTIVE',
          ...(signedToday ? { signedDate: toDateOnlyString(new Date()) } : {}),
        })
        .subscribe({
          next: ({ message }) => {
            this.activating.set(false);
            const text = message?.trim() || 'เริ่มใช้งานสัญญาแล้ว';
            this.snack.open(text, 'ปิด', { duration: message ? 6000 : 2500 });
            this.reload(c.id);
          },
          error: (err: Error) => {
            this.activating.set(false);
            this.snack.open(err.message, 'ปิด', { duration: 4000 });
          },
        });
    });
  }

  renewContract(): void {
    const c = this.contract();
    if (!c || !this.canRenew()) {
      return;
    }
    const startDate = this.addOneYear(c.startDate);
    const endDate = this.addOneYear(c.endDate);
    const price = toMoneyString(c.price);
    openConfirmDialog(this.dialog, {
      title: 'ต่ออายุสัญญา MA',
      message: [
        `สร้างสัญญาใหม่จากสัญญา #${c.id}`,
        `ระยะใหม่: ${startDate} – ${endDate}`,
        `ราคา: ${formatMoneyDisplay(price)} บาท`,
      ].join('\n'),
      confirmLabel: 'ต่ออายุ',
      danger: false,
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.renewing.set(true);
      this.api.renew(c.id, { startDate, endDate, price }).subscribe({
        next: (created) => {
          this.renewing.set(false);
          this.snack.open(
            `ต่ออายุแล้ว · สัญญาใหม่ #${created.id}`,
            'ปิด',
            { duration: 3500 }
          );
          void this.router.navigate(['/app/ma', created.id]);
        },
        error: (err: Error) => {
          this.renewing.set(false);
          this.snack.open(err.message, 'ปิด', { duration: 4000 });
        },
      });
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
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ใบแจ้งค่าบริการ #${c.id}</title>
<style>
body{font-family:Sarabun,sans-serif;padding:32px;color:#1c2b28}
h1{margin:0 0 4px;font-size:1.4rem} .muted{color:#5b6762}
table{width:100%;border-collapse:collapse;margin-top:1.25rem}
th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left}
.total{margin-top:1rem;font-size:1.1rem;font-weight:700}
@media print{button{display:none}}
</style></head><body>
<p class="muted">CPAMS · ใบแจ้งค่าบริการ</p>
<h1>${this.planName(c)} · #${c.id}</h1>
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
    this.openPrintWindow(html, 'ใบแจ้งค่าบริการ');
  }

  private addOneYear(dateStr: string): string {
    const d = parseDateOnly(dateStr) ?? new Date(dateStr);
    d.setFullYear(d.getFullYear() + 1);
    return toDateOnlyString(d);
  }

  private openPrintWindow(html: string, label: string): void {
    const win = window.open('', '_blank', 'width=800,height=900');
    if (!win) {
      this.snack.open(`เบราว์เซอร์บล็อกหน้าต่าง${label}`, 'ปิด', { duration: 3000 });
      return;
    }
    win.document.write(html);
    win.document.close();
  }

  private buildDraftHtml(payload: MaContractPrintPayload): string {
    const { contract, customer, primaryContact, project, plan, addons } = payload;
    const watermark = contract.status === 'CANCELLED' ? 'CANCELLED' : 'DRAFT';
    const customerAddr = [customer.address, customer.province, customer.postalCode]
      .filter(Boolean)
      .join(' ');
    const planItems = (plan.items ?? [])
      .map(
        (item, i) =>
          `<tr><td>${i + 1}</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.detail || '—')}</td></tr>`
      )
      .join('');
    const addonRows = (addons ?? [])
      .map(
        (a) =>
          `<tr><td>${escapeHtml(a.title)}</td><td>${a.extraQuota}</td><td>${formatMoneyDisplay(a.price)}</td></tr>`
      )
      .join('');

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ร่างสัญญา ${escapeHtml(plan.name)} #${contract.id}</title>
<style>
body{font-family:Sarabun,sans-serif;padding:36px;color:#1c2b28;position:relative}
.watermark{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:0}
.watermark span{font-size:7rem;font-weight:800;color:rgba(180,83,9,0.12);transform:rotate(-28deg);letter-spacing:0.08em}
.content{position:relative;z-index:1}
h1{margin:0 0 4px;font-size:1.45rem}
.muted{color:#5b6762;font-size:0.9rem}
.party{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin:1.25rem 0}
.box{border:1px solid #d4d4d4;border-radius:8px;padding:0.85rem 1rem}
.box h3{margin:0 0 0.5rem;font-size:0.95rem}
table{width:100%;border-collapse:collapse;margin-top:0.75rem}
th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left;vertical-align:top}
.sign{display:grid;grid-template-columns:1fr 1fr;gap:2rem;margin-top:3rem}
.sign-line{margin-top:3rem;border-top:1px solid #333;padding-top:0.4rem}
@media print{button{display:none}}
</style></head><body>
<div class="watermark"><span>${watermark}</span></div>
<div class="content">
<p class="muted">CPAMS · ร่างสัญญาบำรุงรักษา (MA)</p>
<h1>${escapeHtml(plan.name)} · #${contract.id}</h1>
<p class="muted">สถานะ: ${escapeHtml(contract.status)} · ระยะ ${escapeHtml(contract.startDate)} – ${escapeHtml(contract.endDate)} · สร้างเอกสาร ${escapeHtml(payload.generatedAt)}</p>

<div class="party">
  <div class="box">
    <h3>ผู้ให้บริการ</h3>
    <p><strong>${escapeHtml(COMPANY_PRINT.name)}</strong><br>
    ${escapeHtml(COMPANY_PRINT.address)}<br>
    เลขผู้เสียภาษี: ${escapeHtml(COMPANY_PRINT.taxId)}</p>
  </div>
  <div class="box">
    <h3>ลูกค้า</h3>
    <p><strong>${escapeHtml(customer.name)}</strong>
    ${customer.code ? `<br>รหัส: ${escapeHtml(customer.code)}` : ''}<br>
    ${customerAddr ? escapeHtml(customerAddr) + '<br>' : ''}
    เลขผู้เสียภาษี: ${escapeHtml(customer.taxId || '—')}<br>
    โทร: ${escapeHtml(customer.phone || '—')}
    ${primaryContact ? `<br>ผู้ติดต่อ: ${escapeHtml(primaryContact.name)}${primaryContact.position ? ' (' + escapeHtml(primaryContact.position) + ')' : ''}` : ''}
    </p>
  </div>
</div>

<p>โปรเจค: ${escapeHtml(project.name)}<br>
แผน: ${escapeHtml(plan.code ? `${plan.code} · ${plan.name}` : plan.name)} · โควตา ${plan.bugQuotaPerMonth} เคส/เดือน<br>
ค่าบริการ: ${formatMoneyDisplay(contract.price)} บาท (${escapeHtml(this.billingLabels[contract.billingCycle])})</p>

<h3>รายการในแผน</h3>
<table>
<thead><tr><th>#</th><th>รายการ</th><th>รายละเอียด</th></tr></thead>
<tbody>
${planItems || '<tr><td colspan="3">—</td></tr>'}
</tbody></table>

<h3>Add-on (แยกจากแผน)</h3>
<table>
<thead><tr><th>รายการ</th><th>โควตาเพิ่ม</th><th>ราคา</th></tr></thead>
<tbody>
${addonRows || '<tr><td colspan="3">ไม่มี Add-on</td></tr>'}
</tbody></table>

${contract.note ? `<p class="muted">หมายเหตุ: ${escapeHtml(contract.note)}</p>` : ''}

<div class="sign">
  <div>
    <div class="sign-line">ลงชื่อ ผู้ให้บริการ</div>
    <p class="muted">วันที่ ............................</p>
  </div>
  <div>
    <div class="sign-line">ลงชื่อ ลูกค้า</div>
    <p class="muted">วันที่ ............................</p>
  </div>
</div>

<p class="muted">เอกสารร่างสำหรับพรีวิว — ไม่ใช่สัญญาที่ลงนามแล้ว</p>
<button onclick="window.print()">พิมพ์</button>
</div>
</body></html>`;
  }
}

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
