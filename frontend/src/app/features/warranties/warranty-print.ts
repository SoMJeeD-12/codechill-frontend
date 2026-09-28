import { WarrantyPrintPayload } from '../../core/models/warranty.model';
import { formatThaiDate, formatThaiDateTime, parseDateOnly } from '../../core/utils/date.util';

/** ค่า placeholder ผู้ให้บริการบนใบรับประกัน (แก้ที่ FE) */
const COMPANY_PRINT = {
  name: 'ชื่อบริษัทเรา',
  address: 'ที่อยู่',
  taxId: 'เลขผู้เสียภาษี',
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

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ใบรับประกัน ${escapeHtml(code)}</title>
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
th{width:32%;color:#5b6762;font-weight:600}
.scope{white-space:pre-wrap}
.sign{display:grid;grid-template-columns:1fr 1fr;gap:2rem;margin-top:3rem}
.sign-line{margin-top:3rem;border-top:1px solid #333;padding-top:0.4rem}
@media print{button{display:none}}
</style></head><body>
${watermark ? `<div class="watermark"><span>${escapeHtml(watermark)}</span></div>` : ''}
<div class="content">
<p class="muted">CPAMS · ใบรับประกันหลังส่งมอบ</p>
<h1>ใบรับประกัน ${escapeHtml(code)}</h1>
<p class="muted">สร้างเอกสาร ${escapeHtml(formatThaiDateTime(payload.generatedAt) || payload.generatedAt)}</p>

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
    ${
      primaryContact
        ? `<br>ผู้ติดต่อหลัก: ${escapeHtml(primaryContact.name)}${primaryContact.position ? ' (' + escapeHtml(primaryContact.position) + ')' : ''}`
        : ''
    }
    </p>
  </div>
</div>

<table>
<tbody>
<tr><th>โปรเจกต์</th><td>${escapeHtml(project.code ? `${project.code} · ${project.name}` : project.name)}</td></tr>
<tr><th>การส่งมอบ</th><td>${escapeHtml(deliveryLabel)}</td></tr>
<tr><th>วันส่งมอบ</th><td>${escapeHtml(formatThaiDate(delivery.deliveredAt) || '—')}</td></tr>
${
  delivery.acceptedByContactName
    ? `<tr><th>ผู้รับมอบ (ลูกค้า)</th><td>${escapeHtml(delivery.acceptedByContactName)}${delivery.acceptedAt ? ' · ' + escapeHtml(formatThaiDate(delivery.acceptedAt)) : ''}</td></tr>`
    : ''
}
<tr><th>ระยะประกัน</th><td>${warranty.durationMonth} เดือน</td></tr>
<tr><th>ช่วงคุ้มครอง</th><td>${escapeHtml(formatThaiDate(warranty.startDate))} – ${escapeHtml(formatThaiDate(warranty.endDate))} <span class="muted">(เริ่มวันถัดจากวันส่งมอบ · นับรวมวันสุดท้าย)</span></td></tr>
${maLabel ? `<tr><th>สัญญา MA ที่มาคู่กัน</th><td>${escapeHtml(maLabel)}</td></tr>` : ''}
<tr><th>ขอบเขตการรับประกัน</th><td class="scope">${escapeHtml(warranty.scopeNote?.trim() || '—')}</td></tr>
</tbody>
</table>

<p class="muted">ประกันครอบคลุมเฉพาะข้อบกพร่องในขอบเขตงานที่ส่งมอบ — การเพิ่มฟีเจอร์ใหม่คิดค่าบริการแยก</p>

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

<button onclick="window.print()">พิมพ์</button>
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
  const win = window.open('', '_blank', 'width=800,height=900');
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
