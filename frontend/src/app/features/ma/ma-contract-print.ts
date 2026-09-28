import { MatSnackBar } from '@angular/material/snack-bar';
import { MA_BILLING_CYCLE_LABELS, MA_STATUS_LABELS } from '../../core/models/ma.model';
import { MaContractPrintPayload, MaService } from '../../core/services/ma.service';
import { formatThaiDate, formatThaiDateTime } from '../../core/utils/date.util';
import { formatMoneyDisplay } from '../../core/utils/money.util';

/** ค่า placeholder ผู้ให้บริการบนสัญญา (แก้ที่ FE) */
const COMPANY_PRINT = {
  name: 'ชื่อบริษัทเรา',
  address: 'ที่อยู่',
  taxId: 'เลขผู้เสียภาษี',
} as const;

/** BE ไม่กั้นการพิมพ์ตามสถานะ — FE ใส่ลายน้ำเอง */
function watermarkText(status: string): string | null {
  if (status === 'DRAFT') {
    return 'ร่าง';
  }
  if (status === 'CANCELLED') {
    return 'ยกเลิก';
  }
  return null;
}

export function buildMaContractPrintHtml(payload: MaContractPrintPayload): string {
  const { contract, customer, primaryContact, project, plan, addons } = payload;
  const contractNo = contract.contractNo?.trim() || null;
  const watermark = watermarkText(contract.status);
  const customerAddr = [customer.address, customer.province, customer.postalCode]
    .filter(Boolean)
    .join(' ');
  const prev = contract.previousContract;
  const prevLabel = prev
    ? [
        prev.contractNo?.trim() || `#${prev.id}`,
        prev.startDate && prev.endDate
          ? `(${formatThaiDate(prev.startDate)} – ${formatThaiDate(prev.endDate)})`
          : null,
      ]
        .filter(Boolean)
        .join(' ')
    : null;
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
  const title = contractNo ? `สัญญา MA ${contractNo}` : `สัญญา MA · ${plan.name}`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
body{font-family:Sarabun,sans-serif;padding:36px;color:#1c2b28;position:relative}
.watermark{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:0}
.watermark span{font-size:7rem;font-weight:800;color:rgba(185,28,28,0.13);transform:rotate(-28deg);letter-spacing:0.08em}
.content{position:relative;z-index:1}
h1{margin:0 0 4px;font-size:1.45rem}
.muted{color:#5b6762;font-size:0.9rem}
.party{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin:1.25rem 0}
.box{border:1px solid #d4d4d4;border-radius:8px;padding:0.85rem 1rem}
.box h3{margin:0 0 0.5rem;font-size:0.95rem}
table{width:100%;border-collapse:collapse;margin-top:0.75rem}
th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left;vertical-align:top}
.terms th{width:32%;color:#5b6762;font-weight:600}
.sign{display:grid;grid-template-columns:1fr 1fr;gap:2rem;margin-top:3rem}
.sign-line{margin-top:3rem;border-top:1px solid #333;padding-top:0.4rem}
@media print{button{display:none}}
</style></head><body>
${watermark ? `<div class="watermark"><span>${escapeHtml(watermark)}</span></div>` : ''}
<div class="content">
<p class="muted">CPAMS · สัญญาบำรุงรักษาระบบ (MA)</p>
<h1>${escapeHtml(title)}</h1>
<p class="muted">สถานะ: ${escapeHtml(MA_STATUS_LABELS[contract.status] ?? contract.status)} · สร้างเอกสาร ${escapeHtml(formatThaiDateTime(payload.generatedAt) || payload.generatedAt)}</p>

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
    ${customer.email ? `<br>อีเมล: ${escapeHtml(customer.email)}` : ''}
    ${
      primaryContact
        ? `<br>ผู้ติดต่อหลัก: ${escapeHtml(primaryContact.name)}${primaryContact.position ? ' (' + escapeHtml(primaryContact.position) + ')' : ''}`
        : ''
    }
    </p>
  </div>
</div>

<table class="terms">
<tbody>
${contractNo ? `<tr><th>เลขที่สัญญา</th><td>${escapeHtml(contractNo)}</td></tr>` : ''}
${prevLabel ? `<tr><th>ต่อจากสัญญาเลขที่</th><td>${escapeHtml(prevLabel)}</td></tr>` : ''}
<tr><th>โปรเจกต์</th><td>${escapeHtml(project.code ? `${project.code} · ${project.name}` : project.name)}</td></tr>
<tr><th>แผน</th><td>${escapeHtml(plan.name)}${plan.description ? `<br><span class="muted">${escapeHtml(plan.description)}</span>` : ''}</td></tr>
<tr><th>ระยะสัญญา</th><td>${escapeHtml(formatThaiDate(contract.startDate))} – ${escapeHtml(formatThaiDate(contract.endDate))}</td></tr>
<tr><th>มูลค่ารวมตลอดอายุสัญญา</th><td>${formatMoneyDisplay(contract.price)} บาท</td></tr>
<tr><th>รอบวางบิล</th><td>${escapeHtml(MA_BILLING_CYCLE_LABELS[contract.billingCycle] ?? contract.billingCycle)}</td></tr>
<tr><th>โควตาแก้บั๊ก</th><td>${plan.bugQuotaPerMonth} เคส/เดือน</td></tr>
${plan.responseTimeHour != null ? `<tr><th>เวลาตอบกลับ</th><td>ภายใน ${plan.responseTimeHour} ชั่วโมง</td></tr>` : ''}
${plan.onsiteQuotaPerMonth != null ? `<tr><th>เข้าหน้างาน</th><td>${plan.onsiteQuotaPerMonth} ครั้ง/เดือน</td></tr>` : ''}
<tr><th>วันที่เซ็น</th><td>${contract.signedDate ? escapeHtml(formatThaiDate(contract.signedDate)) : 'ยังไม่ได้เซ็น'}</td></tr>
</tbody>
</table>

<h3>รายการบริการในแผน</h3>
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
    <div class="sign-line">ลงชื่อ ลูกค้า${primaryContact ? ` (${escapeHtml(primaryContact.name)})` : ''}</div>
    <p class="muted">วันที่ ............................</p>
  </div>
</div>

${contract.signedDate ? '' : '<p class="muted">ยังไม่มีวันที่เซ็น — เอกสารนี้เป็นร่างสำหรับเซ็น</p>'}
<button onclick="window.print()">พิมพ์</button>
</div>
</body></html>`;
}

/**
 * พิมพ์สัญญา MA — เปิดหน้าต่างทันทีตอนคลิก (กันเบราว์เซอร์บล็อก popup) แล้วเติมเนื้อหาเมื่อได้ข้อมูล
 * GET /ma-contracts/:id/print · พิมพ์ได้ทุกสถานะ
 */
export function printMaContract(api: MaService, snack: MatSnackBar, contractId: number): void {
  const win = window.open('', '_blank', 'width=800,height=900');
  if (!win) {
    snack.open('เบราว์เซอร์บล็อกหน้าต่างพิมพ์สัญญา', 'ปิด', { duration: 3500 });
    return;
  }
  win.document.write(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>สัญญา MA</title></head>' +
      '<body style="font-family:Sarabun,sans-serif;padding:36px">กำลังเตรียมสัญญา…</body></html>'
  );
  win.document.close();
  api.getPrintPayload(contractId).subscribe({
    next: (payload) => {
      win.document.open();
      win.document.write(buildMaContractPrintHtml(payload));
      win.document.close();
    },
    error: (err: Error) => {
      win.close();
      snack.open(err.message || 'โหลดข้อมูลสัญญาไม่สำเร็จ', 'ปิด', { duration: 4000 });
    },
  });
}

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
