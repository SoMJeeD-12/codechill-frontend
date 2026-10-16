import { WarrantyPrintPayload } from '../../core/models/warranty.model';
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
  const code = warranty.warrantyNo?.trim() || `#${warranty.id}`;
  const watermark = watermarkText(payload);
  const customerAddr = [customer.address, customer.province, customer.postalCode]
    .filter(Boolean)
    .join(' ');
  const deliveryLabel = [
    delivery.deliveryNo?.trim(),
    delivery.title,
    delivery.version ? `เวอร์ชัน ${delivery.version}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const maLabel = maContract
    ? [maContract.contractNo?.trim(), maContract.planName?.trim()].filter(Boolean).join(' · ') ||
      `#${maContract.id}`
    : null;

  const logoUrl =
    typeof location !== 'undefined' ? `${location.origin}/logo.png` : 'logo.png';
  const providerLines = [
    COMPANY_PRINT.address ? `<dd class="span">${escapeHtml(COMPANY_PRINT.address)}</dd>` : '',
    COMPANY_PRINT.taxId
      ? `<dt>เลขผู้เสียภาษี</dt><dd>${escapeHtml(COMPANY_PRINT.taxId)}</dd>`
      : '',
  ].join('');

  return `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><title>ใบรับประกัน ${escapeHtml(code)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
body{margin:0;background:#e7eeeb;color:#1c2b28;font-family:Sarabun,"Segoe UI",sans-serif}
.sheet{position:relative;max-width:820px;margin:1.25rem auto 2.5rem;background:#fff;padding:1.75rem 2rem 1.5rem;box-shadow:0 10px 28px rgba(28,43,40,.08)}
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
.docno strong{display:block;color:#0f766e;font-size:1.15rem;letter-spacing:.01em}
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
.len{flex:0 0 auto;font-weight:700;color:#0f766e;font-size:.95rem}
table{width:100%;border-collapse:collapse}
th,td{padding:.5rem .1rem;border-bottom:1px solid #e4ebe8;text-align:left;vertical-align:top;font-size:.9rem}
th{width:28%;color:#5b6762;font-weight:600}
.scope{margin:.85rem 0 0;padding:.75rem .9rem;border-radius:10px;background:#f7fbf9;border:1px solid #e4ebe8}
.scope h3{margin:0 0 .3rem;font-size:.75rem;color:#0f766e;letter-spacing:.04em}
.scope p{margin:0;white-space:pre-wrap;font-size:.9rem}
.note{margin:.7rem 0 0;color:#5b6762;font-size:.8rem}
.sign{display:grid;grid-template-columns:1fr 1fr;gap:2.25rem;margin-top:2.1rem}
.sign-space{height:2.8rem}
.sign-line{border-top:1px solid #1c2b28;padding-top:.4rem;text-align:center;font-weight:600;font-size:.88rem}
.sign p{margin:.3rem 0 0;text-align:center;color:#5b6762;font-size:.8rem}
.foot{display:flex;justify-content:space-between;gap:1rem;margin-top:1.4rem;padding-top:.55rem;border-top:1px solid #e4ebe8;color:#5b6762;font-size:.72rem}
.toolbar{position:sticky;top:0;z-index:5;display:flex;justify-content:flex-end;padding:.7rem 1rem;background:#e7eeeb}
.print-btn{border:0;border-radius:999px;padding:.6rem 1.25rem;background:#0f766e;color:#fff;font:600 .95rem Sarabun,sans-serif;cursor:pointer}
.sheet{margin-top:0}
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
      <span>ใบรับประกันหลังส่งมอบ</span>
    </div>
  </div>
  <div class="docno">
    <span>เลขที่ใบรับประกัน</span>
    <strong>${escapeHtml(code)}</strong>
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
    <span>ช่วงคุ้มครอง</span>
    <strong>${escapeHtml(formatThaiDate(warranty.startDate))} – ${escapeHtml(formatThaiDate(warranty.endDate))}</strong>
    <em>เริ่มวันถัดจากวันส่งมอบ · นับรวมวันสุดท้าย</em>
  </div>
  <div class="len">${warranty.durationMonth} เดือน</div>
</div>

<table>
<tbody>
<tr><th>โปรเจกต์</th><td>${escapeHtml(project.code ? `${project.code} · ${project.name}` : project.name)}</td></tr>
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
