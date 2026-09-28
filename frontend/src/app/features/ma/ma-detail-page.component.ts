import { Location } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  MA_BILLING_CYCLE_LABELS,
  MaAddon,
  MaBillingCycle,
  MaContract,
  MaCoverageState,
  MaQuotaStatus,
  maContractEndDate,
  maCoverageDaysHint,
  maCoverageLabel,
  maPlanDisplayName,
  maSlaHours,
  resolveMaCoverageState,
} from '../../core/models/ma.model';
import { AuthService } from '../../core/services/auth.service';
import { CustomerService } from '../../core/services/customer.service';
import {
  MaAddonInput,
  MaContractPrintPayload,
  MaContractRenewInput,
  MaService,
} from '../../core/services/ma.service';
import { ProjectService } from '../../core/services/project.service';
import { addDays, parseDateOnly, toDateOnlyString } from '../../core/utils/date.util';
import { navigateBack } from '../../core/utils/navigation.util';
import { formatMoneyDisplay, parseMoneyValue, toMoneyString } from '../../core/utils/money.util';
import { openConfirmDialog } from '../../shared/components/confirm-dialog.component';
import { EntityAttachmentsComponent } from '../../shared/components/entity-attachments.component';
import { MoneyInputDirective } from '../../shared/directives/money-input.directive';
import { BahtPipe } from '../../shared/pipes/baht.pipe';
import { ThaiDatePipe } from '../../shared/pipes/thai-date.pipe';
import { TablePaginatorComponent } from '../../shared/components/table-paginator.component';
import { createClientPager } from '../../shared/utils/client-pager';
import { FORM_DIALOG_COMPACT } from '../../shared/utils/form-dialog';

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
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatDialogModule,
    TablePaginatorComponent,
    EntityAttachmentsComponent,
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
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly contract = signal<MaContract | null>(null);
  readonly quota = signal<MaQuotaStatus | null>(null);
  readonly addons = signal<MaAddon[]>([]);
  readonly addonsPager = createClientPager(this.addons);
  readonly notFound = signal(false);
  readonly renewing = signal(false);
  readonly activating = signal(false);
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

  coverageStateOf(contract: MaContract): MaCoverageState {
    return resolveMaCoverageState(contract);
  }

  coverageLabel(contract: MaContract): string {
    return maCoverageLabel(contract);
  }

  coverageDaysHint(contract: MaContract): string | null {
    return maCoverageDaysHint(contract);
  }

  goBack(): void {
    const projectId = this.contract()?.projectId;
    navigateBack(
      this.location,
      this.router,
      projectId ? `/app/projects/${projectId}` : '/app/ma/plans'
    );
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

  remaining(): number | null {
    return this.quota()?.remaining ?? null;
  }

  openAddAddon(): void {
    const c = this.contract();
    if (!c) {
      return;
    }
    const ref = this.dialog.open(MaAddonDialogComponent, {
      ...FORM_DIALOG_COMPACT,
      data: { contractId: c.id } satisfies MaAddonDialogData,
    });
    ref.afterClosed().subscribe((saved) => {
      if (saved) {
        this.snack.open('เพิ่ม Add-on แล้ว', 'ปิด', { duration: 2500 });
        this.reload();
      }
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
    const ref = this.dialog.open(MaRenewDialogComponent, {
      ...FORM_DIALOG_COMPACT,
      data: {
        contract: c,
        defaultStartDate: this.dayAfter(c.endDate),
      },
    });
    ref.afterClosed().subscribe((input: MaContractRenewInput | undefined) => {
      if (!input) {
        return;
      }
      this.renewing.set(true);
      this.api.renew(c.id, input).subscribe({
        next: (created) => {
          this.renewing.set(false);
          this.snack.open(
            created.contractNo?.trim()
              ? `ต่ออายุแล้ว · ${created.contractNo.trim()} (สถานะแบบร่าง)`
              : `ต่ออายุแล้ว · สัญญาใหม่ #${created.id} (สถานะแบบร่าง)`,
            'ปิด',
            { duration: 4000 }
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

  private dayAfter(dateStr: string): string {
    return toDateOnlyString(addDays(parseDateOnly(dateStr) ?? new Date(dateStr), 1));
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

<p>โปรเจกต์: ${escapeHtml(project.name)}<br>
แผน: ${escapeHtml(plan.code ? `${plan.code} · ${plan.name}` : plan.name)} · โควตา ${plan.bugQuotaPerMonth} เคส/เดือน<br>
มูลค่ารวมตลอดอายุสัญญา: ${formatMoneyDisplay(contract.price)} บาท<br>
รอบวางบิล: ${escapeHtml(this.billingLabels[contract.billingCycle])}</p>

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

export interface MaRenewDialogData {
  contract: MaContract;
  /** ค่าเริ่มต้น = วันถัดจากวันสิ้นสุดฉบับเดิม */
  defaultStartDate: string;
}

@Component({
  selector: 'app-ma-renew-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatDatepickerModule,
    MatSelectModule,
    MoneyInputDirective,
    ThaiDatePipe,
  ],
  template: `
    <h2 mat-dialog-title>ต่ออายุสัญญา MA</h2>
    <mat-dialog-content>
      <p class="lead">
        สร้างสัญญาฉบับใหม่จาก
        {{ data.contract.contractNo?.trim() || '#' + data.contract.id }}
        · สัญญาใหม่เริ่มเป็นแบบร่าง · ฉบับเดิมจะเป็น「ต่ออายุแล้ว」
      </p>
      <form [formGroup]="form" id="ma-renew-form" class="form" (ngSubmit)="submit()">
        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>วันเริ่ม *</mat-label>
            <input
              matInput
              [matDatepicker]="startPicker"
              formControlName="startDate"
              readonly
              (click)="startPicker.open()"
            />
            <mat-datepicker-toggle matIconSuffix [for]="startPicker"></mat-datepicker-toggle>
            <mat-datepicker #startPicker></mat-datepicker>
          </mat-form-field>
          @if (manualEnd()) {
            <mat-form-field appearance="outline">
              <mat-label>วันสิ้นสุด *</mat-label>
              <input
                matInput
                [matDatepicker]="endPicker"
                formControlName="endDate"
                [min]="minEndDate()"
                readonly
                (click)="endPicker.open()"
              />
              <mat-datepicker-toggle matIconSuffix [for]="endPicker"></mat-datepicker-toggle>
              <mat-datepicker #endPicker></mat-datepicker>
              <mat-hint>
                กำหนดเอง ·
                <button type="button" class="link-btn" (click)="toggleManualEnd()">ใช้วันที่ระบบคำนวณ</button>
              </mat-hint>
            </mat-form-field>
          } @else {
            <div class="end-date">
              <span class="end-date__label">วันสิ้นสุด</span>
              <strong>{{ form.controls.endDate.value | thaiDate: 'date' }}</strong>
              <span class="end-date__hint">
                ระบบคำนวณให้ (วันเริ่ม +
                {{ form.controls.billingCycle.value === 'MONTHLY' ? '1 เดือน' : '12 เดือน' }} − 1 วัน)
              </span>
              <button type="button" class="link-btn" (click)="toggleManualEnd()">แก้วันสิ้นสุด</button>
            </div>
          }
        </div>
        <mat-form-field appearance="outline" class="full">
          <mat-label>รอบวางบิล</mat-label>
          <mat-select formControlName="billingCycle">
            @for (b of billingCycles; track b) {
              <mat-option [value]="b">{{ billingLabels[b] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>มูลค่าสัญญาใหม่ (บาท) *</mat-label>
          <input matInput appMoneyInput formControlName="price" inputmode="decimal" />
          <mat-hint>มูลค่ารวมตลอดอายุสัญญา</mat-hint>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>หมายเหตุ</mat-label>
          <textarea matInput rows="2" formControlName="note"></textarea>
        </mat-form-field>
        @if (error()) {
          <p class="error">{{ error() }}</p>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button color="primary" type="submit" form="ma-renew-form">
        ต่ออายุ
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .lead {
      margin: 0 0 0.75rem;
      color: #5b6762;
      font-size: 0.9rem;
      line-height: 1.45;
    }
    .form {
      display: grid;
      gap: 0.35rem;
      min-width: min(100%, 28rem);
    }
    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.55rem;
    }
    .full {
      width: 100%;
    }
    .end-date {
      display: grid;
      gap: 0.15rem;
      align-content: start;
      padding: 0.55rem 0.75rem;
      border-radius: 10px;
      background: #f8fafc;
      border: 1px solid rgba(28, 43, 40, 0.1);
    }
    .end-date__label,
    .end-date__hint {
      font-size: 0.75rem;
      color: #64748b;
      line-height: 1.3;
    }
    .link-btn {
      justify-self: start;
      padding: 0;
      border: 0;
      background: none;
      color: #0f766e;
      font: inherit;
      font-size: 0.75rem;
      text-decoration: underline;
      cursor: pointer;
    }
    .error {
      color: #b91c1c;
      margin: 0.25rem 0 0;
    }
  `,
})
export class MaRenewDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly ref = inject(MatDialogRef<MaRenewDialogComponent, MaContractRenewInput>);
  readonly data = inject<MaRenewDialogData>(MAT_DIALOG_DATA);
  readonly billingLabels = MA_BILLING_CYCLE_LABELS;
  readonly billingCycles = Object.keys(MA_BILLING_CYCLE_LABELS) as MaBillingCycle[];
  readonly error = signal<string | null>(null);

  readonly form = this.fb.group({
    startDate: [
      parseDateOnly(this.data.defaultStartDate) as Date | null,
      Validators.required,
    ],
    price: [
      parseMoneyValue(this.data.contract.price) ?? 0,
      [Validators.required, Validators.min(0)],
    ],
    billingCycle: [this.data.contract.billingCycle as MaBillingCycle],
    endDate: [null as Date | null, Validators.required],
    note: [this.data.contract.note ?? ''],
  });

  /** true = กำหนดวันสิ้นสุดเอง · false = คำนวณจากวันเริ่ม + รอบวางบิล */
  readonly manualEnd = signal(false);
  readonly minEndDate = signal<Date | null>(null);

  constructor() {
    this.recalcEnd();
    this.refreshMinEnd();
    this.form.controls.startDate.valueChanges.subscribe(() => {
      this.refreshMinEnd();
      if (!this.manualEnd()) {
        this.recalcEnd();
      }
    });
    this.form.controls.billingCycle.valueChanges.subscribe(() => {
      if (!this.manualEnd()) {
        this.recalcEnd();
      }
    });
  }

  toggleManualEnd(): void {
    const next = !this.manualEnd();
    this.manualEnd.set(next);
    if (!next) {
      this.recalcEnd();
    }
  }

  private recalcEnd(): void {
    const start = this.form.controls.startDate.value;
    const cycle = this.form.controls.billingCycle.value ?? 'YEARLY';
    this.form.controls.endDate.setValue(start ? maContractEndDate(start, cycle) : null, {
      emitEvent: false,
    });
  }

  private refreshMinEnd(): void {
    const start = this.form.controls.startDate.value;
    this.minEndDate.set(start ? addDays(start, 1) : null);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const startDate = toDateOnlyString(raw.startDate);
    const endDate = toDateOnlyString(raw.endDate);
    if (!startDate || !endDate || endDate <= startDate) {
      this.error.set('วันสิ้นสุดต้องอยู่หลังวันเริ่ม');
      return;
    }
    this.ref.close({
      startDate,
      endDate,
      price: toMoneyString(raw.price),
      billingCycle: raw.billingCycle as MaBillingCycle,
      note: raw.note?.trim() || null,
    });
  }
}

export interface MaAddonDialogData {
  contractId: number;
}

@Component({
  selector: 'app-ma-addon-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MoneyInputDirective,
  ],
  template: `
    <h2 mat-dialog-title>เพิ่ม Add-on</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="ma-addon-form" class="form" (ngSubmit)="submit()">
        <mat-form-field appearance="outline" class="full">
          <mat-label>ชื่อแพ็ก *</mat-label>
          <input matInput formControlName="title" placeholder="เช่น แพ็กโควตาเพิ่ม +3 เคส" />
        </mat-form-field>
        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>โควตาเพิ่ม</mat-label>
            <input matInput type="number" formControlName="extraQuota" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>ราคา</mat-label>
            <input matInput appMoneyInput formControlName="price" inputmode="decimal" />
          </mat-form-field>
        </div>
        <mat-form-field appearance="outline" class="full">
          <mat-label>หมายเหตุ</mat-label>
          <textarea matInput rows="2" formControlName="note"></textarea>
        </mat-form-field>
        <label class="scope">
          <input type="checkbox" [checked]="scoped()" (change)="toggleScope($event)" />
          จำกัดเฉพาะเดือน/ปี (ไม่ติ๊ก = มีผลตลอดอายุสัญญา)
        </label>
        @if (scoped()) {
          <div class="row">
            <mat-form-field appearance="outline">
              <mat-label>ปีที่มีผล *</mat-label>
              <input matInput type="number" formControlName="effectiveYear" min="2000" max="2100" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>เดือนที่มีผล *</mat-label>
              <input matInput type="number" formControlName="effectiveMonth" min="1" max="12" />
            </mat-form-field>
          </div>
        }
        @if (error()) {
          <p class="error">{{ error() }}</p>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close [disabled]="saving()">ยกเลิก</button>
      <button
        mat-flat-button
        color="primary"
        type="submit"
        form="ma-addon-form"
        [disabled]="saving()"
      >
        บันทึก Add-on
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .form {
      display: grid;
      gap: 0.35rem;
      min-width: min(100%, 28rem);
    }
    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.55rem;
    }
    .full {
      width: 100%;
    }
    .scope {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      margin: 0.25rem 0 0.5rem;
      font-size: 0.875rem;
      color: #3d4a46;
      cursor: pointer;
    }
    .scope input {
      margin-top: 0.15rem;
    }
    .error {
      color: #b91c1c;
      margin: 0.25rem 0 0;
    }
  `,
})
export class MaAddonDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(MaService);
  private readonly ref = inject(MatDialogRef<MaAddonDialogComponent, boolean>);
  readonly data = inject<MaAddonDialogData>(MAT_DIALOG_DATA);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly scoped = signal(false);

  readonly form = this.fb.nonNullable.group({
    title: ['', Validators.required],
    extraQuota: [1, [Validators.required, Validators.min(0)]],
    price: [0, Validators.min(0)],
    note: [''],
    effectiveYear: [null as number | null],
    effectiveMonth: [null as number | null],
  });

  toggleScope(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.scoped.set(checked);
    if (!checked) {
      this.form.patchValue({ effectiveYear: null, effectiveMonth: null });
    } else {
      const now = new Date();
      this.form.patchValue({
        effectiveYear: now.getFullYear(),
        effectiveMonth: now.getMonth() + 1,
      });
    }
  }

  submit(): void {
    if (this.saving()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const year = raw.effectiveYear;
    const month = raw.effectiveMonth;
    if (this.scoped()) {
      if (year == null || month == null || month < 1 || month > 12) {
        this.error.set('กรุณาระบุปีและเดือนที่มีผลพร้อมกัน');
        return;
      }
    } else if ((year == null) !== (month == null)) {
      this.error.set('ปีและเดือนต้องส่งคู่กัน หรือไม่ส่งทั้งคู่');
      return;
    }
    const payload: MaAddonInput = {
      title: raw.title.trim(),
      addonType: 'EXTRA_QUOTA',
      extraQuota: Number(raw.extraQuota) || 0,
      price: toMoneyString(raw.price),
      note: raw.note?.trim() || null,
      ...(year != null && month != null
        ? { effectiveYear: Number(year), effectiveMonth: Number(month) }
        : {}),
    };
    this.error.set(null);
    this.saving.set(true);
    this.api.addAddon(this.data.contractId, payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.ref.close(true);
      },
      error: (err: Error) => {
        this.saving.set(false);
        this.error.set(err.message);
      },
    });
  }
}
