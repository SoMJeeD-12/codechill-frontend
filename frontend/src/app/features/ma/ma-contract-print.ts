import { MatSnackBar } from '@angular/material/snack-bar';
import { MA_BILLING_CYCLE_LABELS, MA_STATUS_LABELS } from '../../core/models/ma.model';
import { MaContractPrintPayload, MaService } from '../../core/services/ma.service';
import { formatThaiDate, formatThaiDateTime } from '../../core/utils/date.util';
import { PRINT_LOGO_SRC } from '../../shared/print/print-logo';
import { formatMoneyDisplay } from '../../core/utils/money.util';

/** ผู้ให้บริการบนสัญญา — ใส่ที่อยู่/เลขภาษีเมื่อมีข้อมูลจริง */
const COMPANY_PRINT = {
  name: 'Code Chill',
  address: '',
  taxId: '',
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
  const watermark = watermarkText(contract.status);
  const customerAddr = [customer.address, customer.province, customer.postalCode]
    .filter(Boolean)
    .join(' ');
  const prev = contract.previousContract;
  const prevLabel =
    prev?.startDate && prev.endDate
      ? `${formatThaiDate(prev.startDate)} – ${formatThaiDate(prev.endDate)}`
      : prev
        ? 'สัญญาเดิม'
        : null;
  const planItems = (plan.items ?? [])
    .map(
      (item, i) =>
        `<tr><td class="num">${i + 1}</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.detail || '—')}</td></tr>`
    )
    .join('');
  const addonRows = (addons ?? [])
    .map(
      (a) =>
        `<tr><td>${escapeHtml(a.title)}</td><td>${a.extraQuota}</td><td>${formatMoneyDisplay(a.price)}</td></tr>`
    )
    .join('');
  const title = `สัญญา MA · ${plan.name}`;
  const statusLabel = MA_STATUS_LABELS[contract.status] ?? contract.status;
  const logoUrl = PRINT_LOGO_SRC;
  const providerLines = [
    COMPANY_PRINT.address ? `<dd class="span">${escapeHtml(COMPANY_PRINT.address)}</dd>` : '',
    COMPANY_PRINT.taxId
      ? `<dt>เลขผู้เสียภาษี</dt><dd>${escapeHtml(COMPANY_PRINT.taxId)}</dd>`
      : '',
  ].join('');
  const priceLabel = formatMoneyDisplay(contract.price);

  return `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
body{margin:0;background:#e7eeeb;color:#1c2b28;font-family:Sarabun,"Segoe UI",sans-serif}
.sheet{position:relative;max-width:820px;margin:0 auto 2.5rem;background:#fff;padding:1.75rem 2rem 1.5rem;box-shadow:0 10px 28px rgba(28,43,40,.08)}
.watermark{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}
.watermark span{font-size:6.5rem;font-weight:800;color:rgba(185,28,28,.12);transform:rotate(-24deg);letter-spacing:.08em}
.content{position:relative}
.head{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding-bottom:.55rem;border-bottom:2px solid #0f766e}
.brand{display:flex;align-items:center;gap:.55rem;min-width:0}
.brand img{width:36px;height:36px;object-fit:contain}
.brand strong{display:block;font-size:1rem}
.brand span{display:block;color:#5b6762;font-size:.78rem}
.docno{text-align:right}
.docno span{display:block;color:#5b6762;font-size:.72rem}
.docno strong{display:block;color:#0f766e;font-size:1.05rem}
.party{display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;margin:.7rem 0 .45rem}
.box h3{margin:0 0 .15rem;color:#5b6762;font-size:.72rem;font-weight:600}
.who{margin:0 0 .15rem;font-size:1rem;font-weight:700}
.role{margin:0;color:#5b6762;font-size:.82rem}
.kv{display:grid;grid-template-columns:5.6rem 1fr;gap:.05rem .4rem;margin:0;font-size:.84rem}
.kv dt{color:#5b6762}
.kv dd{margin:0}
.kv dd.span{grid-column:1 / -1}
.terms{width:100%;border-collapse:collapse;margin-top:.35rem}
.terms th,.terms td{padding:.28rem .1rem;border-bottom:1px solid #e4ebe8;text-align:left;vertical-align:top;font-size:.86rem}
.terms th{width:24%;color:#5b6762;font-weight:600}
.block{margin:.7rem 0 0}
.block h3{margin:0 0 .2rem;font-size:.78rem;color:#1c2b28}
.grid{width:100%;border-collapse:collapse;font-size:.84rem}
.grid th,.grid td{padding:.22rem .2rem;border-bottom:1px solid #e4ebe8;text-align:left;vertical-align:top}
.grid th{color:#5b6762;font-weight:600;font-size:.75rem}
.grid td.num{width:1.6rem;color:#5b6762}
.note{margin:.45rem 0 0;color:#5b6762;font-size:.78rem;white-space:pre-wrap}
.sign{display:grid;grid-template-columns:1fr 1fr;gap:2rem;margin-top:1.35rem}
.sign-space{height:1.8rem}
.sign-line{border-top:1px solid #1c2b28;padding-top:.3rem;text-align:center;font-weight:600;font-size:.86rem}
.sign p{margin:.2rem 0 0;text-align:center;color:#5b6762;font-size:.78rem}
.foot{display:flex;justify-content:space-between;gap:1rem;margin-top:.9rem;padding-top:.4rem;border-top:1px solid #e4ebe8;color:#5b6762;font-size:.7rem}
.toolbar{position:sticky;top:0;z-index:5;display:flex;justify-content:flex-end;padding:.7rem 1rem;background:#e7eeeb}
.print-btn{border:0;border-radius:999px;padding:.6rem 1.25rem;background:#0f766e;color:#fff;font:600 .95rem Sarabun,sans-serif;cursor:pointer}
@page{size:A4;margin:0}
@media print{
  body{background:#fff}
  .toolbar{display:none}
  .sheet{max-width:none;margin:0;padding:14mm 16mm;box-shadow:none}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
</style></head><body>
<div class="toolbar"><button class="print-btn" onclick="window.print()">พิมพ์</button></div>
<div class="sheet">
${watermark ? `<div class="watermark"><span>${escapeHtml(watermark)}</span></div>` : ''}
<div class="content">
<header class="head">
  <div class="brand">
    <img src="${escapeHtml(logoUrl)}" alt="Code Chill">
    <div>
      <strong>Code Chill</strong>
      <span>สัญญาบำรุงรักษาระบบ (MA)</span>
    </div>
  </div>
</header>

<div class="party">
  <section class="box">
    <h3>ผู้ให้บริการ</h3>
    <p class="who">${escapeHtml(COMPANY_PRINT.name)}</p>
    ${
      providerLines
        ? `<dl class="kv">${providerLines}</dl>`
        : '<p class="role">ผู้พัฒนาและดูแลระบบ</p>'
    }
  </section>
  <section class="box">
    <h3>ลูกค้า</h3>
    <p class="who">${escapeHtml(customer.name)}</p>
    <dl class="kv">
      ${customerAddr ? `<dt>ที่อยู่</dt><dd>${escapeHtml(customerAddr)}</dd>` : ''}
      <dt>เลขผู้เสียภาษี</dt><dd>${escapeHtml(customer.taxId || '—')}</dd>
      <dt>โทร</dt><dd>${escapeHtml(customer.phone || '—')}</dd>
      ${customer.email ? `<dt>อีเมล</dt><dd>${escapeHtml(customer.email)}</dd>` : ''}
      ${
        primaryContact
          ? `<dt>ผู้ติดต่อ</dt><dd>${escapeHtml(primaryContact.name)}${primaryContact.position ? ' (' + escapeHtml(primaryContact.position) + ')' : ''}</dd>`
          : ''
      }
    </dl>
  </section>
</div>

<table class="terms">
<tbody>
<tr><th>ระยะสัญญา</th><td>${escapeHtml(formatThaiDate(contract.startDate))} – ${escapeHtml(formatThaiDate(contract.endDate))} · ${escapeHtml(statusLabel)}${contract.signedDate ? ' · เซ็นเมื่อ ' + escapeHtml(formatThaiDate(contract.signedDate)) : ' · ยังไม่ได้เซ็น'}</td></tr>
<tr><th>มูลค่ารวม</th><td>${priceLabel ? escapeHtml(priceLabel) + ' บาท ตลอดอายุสัญญา' : '—'}</td></tr>
${prevLabel ? `<tr><th>ต่อจากสัญญา</th><td>${escapeHtml(prevLabel)}</td></tr>` : ''}
<tr><th>โปรเจกต์</th><td>${escapeHtml(project.name)}</td></tr>
<tr><th>แผน</th><td>${escapeHtml(plan.name)}${plan.description ? `<br><span style="color:#5b6762;font-size:.82rem">${escapeHtml(plan.description)}</span>` : ''}</td></tr>
<tr><th>รอบวางบิล</th><td>${escapeHtml(MA_BILLING_CYCLE_LABELS[contract.billingCycle] ?? contract.billingCycle)}</td></tr>
<tr><th>โควตาแก้บั๊ก</th><td>${plan.bugQuotaPerMonth} เคส/เดือน</td></tr>
${plan.responseTimeHour != null ? `<tr><th>เวลาตอบกลับ</th><td>ภายใน ${plan.responseTimeHour} ชั่วโมง</td></tr>` : ''}
${plan.onsiteQuotaPerMonth != null ? `<tr><th>เข้าหน้างาน</th><td>${plan.onsiteQuotaPerMonth} ครั้ง/เดือน</td></tr>` : ''}
</tbody>
</table>

<section class="block">
  <h3>รายการบริการในแผน</h3>
  <table class="grid">
    <thead><tr><th>#</th><th>รายการ</th><th>รายละเอียด</th></tr></thead>
    <tbody>${planItems || '<tr><td colspan="3">—</td></tr>'}</tbody>
  </table>
</section>

<section class="block">
  <h3>Add-on (แยกจากแผน)</h3>
  <table class="grid">
    <thead><tr><th>รายการ</th><th>โควตาเพิ่ม</th><th>ราคา</th></tr></thead>
    <tbody>${addonRows || '<tr><td colspan="3">ไม่มี Add-on</td></tr>'}</tbody>
  </table>
</section>

${contract.note ? `<p class="note">หมายเหตุ: ${escapeHtml(contract.note)}</p>` : ''}

<div class="sign">
  <div>
    <div class="sign-space"></div>
    <div class="sign-line">ลงชื่อ ผู้ให้บริการ</div>
    <p>วันที่ ............................</p>
  </div>
  <div>
    <div class="sign-space"></div>
    <div class="sign-line">ลงชื่อ ลูกค้า${primaryContact ? ` (${escapeHtml(primaryContact.name)})` : ''}</div>
    <p>วันที่ ............................</p>
  </div>
</div>

<footer class="foot">
  <span>สร้างเอกสาร ${escapeHtml(formatThaiDateTime(payload.generatedAt) || payload.generatedAt)}</span>
  <span>Code Chill · สัญญาบำรุงรักษาระบบ (MA)</span>
</footer>
</div>
</div>
</body></html>`;
}

/**
 * พิมพ์สัญญา MA — เปิดหน้าต่างทันทีตอนคลิก (กันเบราว์เซอร์บล็อก popup) แล้วเติมเนื้อหาเมื่อได้ข้อมูล
 * GET /ma-contracts/:id/print · พิมพ์ได้ทุกสถานะ
 */
export function printMaContract(api: MaService, snack: MatSnackBar, contractId: number): void {
  const win = window.open('', '_blank');
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
