import { WarrantyPrintPayload } from '../../core/models/warranty.model';
import { PRINT_LOGO_SRC } from '../../shared/print/print-logo';
import { formatThaiDate, formatThaiDateTime, parseDateOnly } from '../../core/utils/date.util';

/** ผู้ให้บริการบนใบรับประกัน — ใส่ที่อยู่/เลขภาษีเมื่อมีข้อมูลจริง */
const COMPANY_PRINT = {
  name: 'Code Chill',
  address: '',
  taxId: '',
} as const;

/** ลายน้ำ — ยกเลิก / หมดอายุ (อ่าน isCurrentlyActive ประกอบ เพราะ status อาจค้าง ACTIVE) */
function watermarkText(payload: WarrantyPrintPayload): string | null {
  const w = payload.warranty;
  if (w.status === 'VOID') {
    return 'ยกเลิก';
  }
  if (w.status === 'EXPIRED') {
    return 'หมดอายุ';
  }
  const end = parseDateOnly(w.endDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!w.isCurrentlyActive && end && end.getTime() < today.getTime()) {
    return 'หมดอายุ';
  }
  return null;
}

export function buildWarrantyPrintHtml(payload: WarrantyPrintPayload): string {
  const { warranty, delivery, project, customer, primaryContact, maContract } = payload;
  const watermark = watermarkText(payload);
  const customerAddr = [customer.address, customer.province, customer.postalCode]
    .filter(Boolean)
    .join(' ');
  const deliveryLabel = [
    delivery.title,
    delivery.version ? `เวอร์ชัน ${delivery.version}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const maLabel = maContract?.planName?.trim() || null;

  const logoUrl = PRINT_LOGO_SRC;
  const providerLines = [
    COMPANY_PRINT.address ? `<dd class="span">${escapeHtml(COMPANY_PRINT.address)}</dd>` : '',
    COMPANY_PRINT.taxId
      ? `<dt>เลขผู้เสียภาษี</dt><dd>${escapeHtml(COMPANY_PRINT.taxId)}</dd>`
      : '',
  ].join('');

  return `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><title>ใบรับประกันหลังส่งมอบ</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
body{margin:0;background:#e7eeeb;color:#1c2b28;font-family:Sarabun,"Segoe UI",sans-serif}
.sheet{position:relative;max-width:820px;margin:1.25rem auto 2.5rem;background:#fff;padding:1.75rem 2rem 1.5rem;box-shadow:0 10px 28px rgba(28,43,40,.08)}
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
table{width:100%;border-collapse:collapse;margin-top:.35rem}
th,td{padding:.28rem .1rem;border-bottom:1px solid #e4ebe8;text-align:left;vertical-align:top;font-size:.86rem}
th{width:24%;color:#5b6762;font-weight:600}
.scope{margin:.7rem 0 0}
.scope h3{margin:0 0 .2rem;font-size:.78rem;color:#1c2b28}
.scope p{margin:0;white-space:pre-wrap;font-size:.86rem}
.note{margin:.45rem 0 0;color:#5b6762;font-size:.78rem}
.sign{display:grid;grid-template-columns:1fr 1fr;gap:2rem;margin-top:1.35rem}
.sign-space{height:1.8rem}
.sign-line{border-top:1px solid #1c2b28;padding-top:.3rem;text-align:center;font-weight:600;font-size:.86rem}
.sign p{margin:.2rem 0 0;text-align:center;color:#5b6762;font-size:.78rem}
.foot{display:flex;justify-content:space-between;gap:1rem;margin-top:.9rem;padding-top:.4rem;border-top:1px solid #e4ebe8;color:#5b6762;font-size:.7rem}
.toolbar{position:sticky;top:0;z-index:5;display:flex;justify-content:flex-end;padding:.7rem 1rem;background:#e7eeeb}
.print-btn{border:0;border-radius:999px;padding:.6rem 1.25rem;background:#0f766e;color:#fff;font:600 .95rem Sarabun,sans-serif;cursor:pointer}
.sheet{margin-top:0}
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
      <span>ใบรับประกันหลังส่งมอบ</span>
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
      ${
        primaryContact
          ? `<dt>ผู้ติดต่อ</dt><dd>${escapeHtml(primaryContact.name)}${primaryContact.position ? ' (' + escapeHtml(primaryContact.position) + ')' : ''}</dd>`
          : ''
      }
    </dl>
  </section>
</div>

<table>
<tbody>
<tr><th>ช่วงคุ้มครอง</th><td>${escapeHtml(formatThaiDate(warranty.startDate))} – ${escapeHtml(formatThaiDate(warranty.endDate))} · ${warranty.durationMonth} เดือน · เริ่มวันถัดจากวันส่งมอบ นับรวมวันสุดท้าย</td></tr>
<tr><th>โปรเจกต์</th><td>${escapeHtml(project.name)}</td></tr>
<tr><th>การส่งมอบ</th><td>${escapeHtml(deliveryLabel)}</td></tr>
<tr><th>วันส่งมอบ</th><td>${escapeHtml(formatThaiDate(delivery.deliveredAt) || '—')}</td></tr>
${
  delivery.acceptedByContactName
    ? `<tr><th>ผู้รับมอบ</th><td>${escapeHtml(delivery.acceptedByContactName)}${delivery.acceptedAt ? ' · ' + escapeHtml(formatThaiDate(delivery.acceptedAt)) : ''}</td></tr>`
    : ''
}
${maLabel ? `<tr><th>สัญญา MA</th><td>${escapeHtml(maLabel)}</td></tr>` : ''}
</tbody>
</table>

<section class="scope">
  <h3>ขอบเขตการรับประกัน</h3>
  <p>${escapeHtml(warranty.scopeNote?.trim() || '—')}</p>
</section>
<p class="note">ประกันครอบคลุมเฉพาะข้อบกพร่องในขอบเขตงานที่ส่งมอบ — การเพิ่มฟีเจอร์ใหม่คิดค่าบริการแยก</p>

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
  <span>Code Chill · ใบรับประกันหลังส่งมอบ</span>
</footer>
</div>
</div>
</body></html>`;
}

/**
 * เปิดหน้าต่างพิมพ์ทันทีตอนคลิก (กันเบราว์เซอร์บล็อก popup หลังรอ API) แล้วเติมเนื้อหาภายหลัง
 * คืน null เมื่อถูกบล็อก
 */
export function openWarrantyPrintWindow(
  load: (done: (payload: WarrantyPrintPayload) => void, fail: (message: string) => void) => void
): Window | null {
  const win = window.open('', '_blank');
  if (!win) {
    return null;
  }
  win.document.write(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>ใบรับประกัน</title></head>' +
      '<body style="font-family:Sarabun,sans-serif;padding:36px">กำลังเตรียมใบรับประกัน…</body></html>'
  );
  win.document.close();
  load(
    (payload) => {
      win.document.open();
      win.document.write(buildWarrantyPrintHtml(payload));
      win.document.close();
    },
    () => win.close()
  );
  return win;
}

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
