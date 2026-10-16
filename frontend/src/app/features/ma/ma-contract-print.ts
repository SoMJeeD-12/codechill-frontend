import { MatSnackBar } from '@angular/material/snack-bar';
import { MA_BILLING_CYCLE_LABELS, MA_STATUS_LABELS } from '../../core/models/ma.model';
import { MaContractPrintPayload, MaService } from '../../core/services/ma.service';
import { formatThaiDate, formatThaiDateTime } from '../../core/utils/date.util';
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
        `<tr><td class="num">${i + 1}</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.detail || '—')}</td></tr>`
    )
    .join('');
  const addonRows = (addons ?? [])
    .map(
      (a) =>
        `<tr><td>${escapeHtml(a.title)}</td><td>${a.extraQuota}</td><td>${formatMoneyDisplay(a.price)}</td></tr>`
    )
    .join('');
  const title = contractNo ? `สัญญา MA ${contractNo}` : `สัญญา MA · ${plan.name}`;
  const statusLabel = MA_STATUS_LABELS[contract.status] ?? contract.status;
  const logoUrl =
    typeof location !== 'undefined' ? `${location.origin}/logo.png` : 'logo.png';
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
.head{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding-bottom:.9rem;border-bottom:3px solid #0f766e}
.brand{display:flex;align-items:center;gap:.7rem;min-width:0}
.brand img{width:46px;height:46px;object-fit:contain}
.brand strong{display:block;font-size:1.05rem}
.brand span{display:block;color:#5b6762;font-size:.82rem}
.docno{text-align:right}
.docno span{display:block;color:#5b6762;font-size:.72rem}
.docno strong{display:block;color:#0f766e;font-size:1.15rem}
.party{display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin:1rem 0 .85rem}
.box{border:1px solid #d7e0dc;border-radius:10px;padding:.8rem .95rem;background:#f7fbf9}
.box h3{margin:0 0 .45rem;color:#0f766e;font-size:.75rem;letter-spacing:.04em}
.who{margin:0 0 .35rem;font-size:1.05rem;font-weight:700}
.role{margin:0;color:#5b6762;font-size:.85rem}
.kv{display:grid;grid-template-columns:6.4rem 1fr;gap:.18rem .45rem;margin:0;font-size:.88rem}
.kv dt{color:#5b6762}
.kv dd{margin:0}
.kv dd.span{grid-column:1 / -1}
.cover{display:flex;justify-content:space-between;align-items:center;gap:1rem;margin:0 0 .9rem;padding:.8rem 1rem;border-radius:10px;background:#ecfdf5;border:1px solid #b7e4d8}
.cover span{display:block;color:#5b6762;font-size:.75rem}
.cover strong{font-size:1.02rem}
.cover em{display:block;margin-top:.15rem;font-style:normal;color:#5b6762;font-size:.78rem}
.len{flex:0 0 auto;text-align:right;font-weight:700;color:#0f766e;font-size:.95rem}
.len small{display:block;font-weight:600;color:#5b6762;font-size:.72rem}
.terms{width:100%;border-collapse:collapse}
.terms th,.terms td{padding:.5rem .1rem;border-bottom:1px solid #e4ebe8;text-align:left;vertical-align:top;font-size:.9rem}
.terms th{width:28%;color:#5b6762;font-weight:600}
.block{margin:.95rem 0 0;padding:.75rem .9rem;border-radius:10px;background:#f7fbf9;border:1px solid #e4ebe8}
.block h3{margin:0 0 .45rem;font-size:.75rem;color:#0f766e;letter-spacing:.04em}
.grid{width:100%;border-collapse:collapse;font-size:.88rem}
.grid th,.grid td{padding:.4rem .35rem;border-bottom:1px solid #e4ebe8;text-align:left;vertical-align:top}
.grid th{color:#5b6762;font-weight:600;font-size:.78rem}
.grid td.num{width:2rem;color:#5b6762}
.note{margin:.7rem 0 0;color:#5b6762;font-size:.8rem;white-space:pre-wrap}
.sign{display:grid;grid-template-columns:1fr 1fr;gap:2.25rem;margin-top:2.1rem}
.sign-space{height:2.8rem}
.sign-line{border-top:1px solid #1c2b28;padding-top:.4rem;text-align:center;font-weight:600;font-size:.88rem}
.sign p{margin:.3rem 0 0;text-align:center;color:#5b6762;font-size:.8rem}
.foot{display:flex;justify-content:space-between;gap:1rem;margin-top:1.4rem;padding-top:.55rem;border-top:1px solid #e4ebe8;color:#5b6762;font-size:.72rem}
.toolbar{position:sticky;top:0;z-index:5;display:flex;justify-content:flex-end;padding:.7rem 1rem;background:#e7eeeb}
.print-btn{border:0;border-radius:999px;padding:.6rem 1.25rem;background:#0f766e;color:#fff;font:600 .95rem Sarabun,sans-serif;cursor:pointer}
@page{size:A4;margin:12mm}
@media print{
  body{background:#fff}
  .toolbar{display:none}
  .sheet{max-width:none;margin:0;padding:0;box-shadow:none}
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
  <div class="docno">
    <span>เลขที่สัญญา</span>
    <strong>${escapeHtml(contractNo || plan.name)}</strong>
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
      ${customer.code ? `<dt>รหัส</dt><dd>${escapeHtml(customer.code)}</dd>` : ''}
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

<div class="cover">
  <div>
    <span>ระยะสัญญา · ${escapeHtml(statusLabel)}</span>
    <strong>${escapeHtml(formatThaiDate(contract.startDate))} – ${escapeHtml(formatThaiDate(contract.endDate))}</strong>
    <em>${contract.signedDate ? 'เซ็นเมื่อ ' + escapeHtml(formatThaiDate(contract.signedDate)) : 'ยังไม่ได้เซ็น — เอกสารนี้เป็นร่างสำหรับเซ็น'}</em>
  </div>
  <div class="len">${priceLabel ? escapeHtml(priceLabel) + ' บาท' : '—'}<small>มูลค่ารวมตลอดอายุสัญญา</small></div>
</div>

<table class="terms">
<tbody>
${prevLabel ? `<tr><th>ต่อจากสัญญา</th><td>${escapeHtml(prevLabel)}</td></tr>` : ''}
<tr><th>โปรเจกต์</th><td>${escapeHtml(project.code ? `${project.code} · ${project.name}` : project.name)}</td></tr>
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
