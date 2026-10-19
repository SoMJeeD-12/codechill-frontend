import { forkJoin } from 'rxjs';
import {
  RESOLUTION_RESULT_LABELS,
  ResolutionResult,
  Ticket,
} from '../../core/models/ticket.model';
import { TicketService } from '../../core/services/ticket.service';
import { formatThaiDateTime } from '../../core/utils/date.util';
import { PRINT_LOGO_SRC } from '../../shared/print/print-logo';

/** ใบอ่านให้ลูกค้า — ไม่ใช่ใบเซ็นรับ และไม่บันทึกว่าบอกลูกค้าแล้ว */
export function printCustomerNotice(
  api: TicketService,
  ticketId: number,
  onError: (message: string) => void
): void {
  const win = window.open('', '_blank');
  if (!win) {
    onError('เบราว์เซอร์บล็อกหน้าต่างพิมพ์');
    return;
  }
  win.document.write(
    '<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><title>ใบแจ้งลูกค้า</title></head>' +
      '<body style="font-family:Sarabun,sans-serif;padding:36px">กำลังเตรียมใบแจ้งลูกค้า…</body></html>'
  );
  win.document.close();

  forkJoin({
    ticket: api.get(ticketId),
    print: api.getConfirmationPrint(ticketId),
  }).subscribe({
    next: ({ ticket, print }) => {
      win.document.open();
      win.document.write(buildCustomerNoticeHtml(ticket, print));
      win.document.close();
    },
    error: (err: Error) => {
      win.close();
      onError(err.message || 'โหลดข้อมูลสำหรับแจ้งลูกค้าไม่สำเร็จ');
    },
  });
}

function buildCustomerNoticeHtml(
  ticket: Ticket,
  payload: {
    documentTitle: string;
    ticket: { id: number; ticketNo: string | null; title: string };
    customer: { name: string; code: string | null; phone: string | null; address: string | null };
    project: { code: string | null; name: string } | null;
    reportedByContact: { name: string; phone: string | null } | null;
    resolution: {
      round: number;
      result: string;
      detail: string;
      rootCause: string | null;
      resolvedAt: string;
      resolvedBy?: { fullName: string } | null;
    };
  }
): string {
  const r = payload.resolution;
  const resultLabel = RESOLUTION_RESULT_LABELS[r.result as ResolutionResult] ?? r.result;
  const resolvedAt = formatThaiDateTime(r.resolvedAt) || r.resolvedAt || '—';
  const projectLabel = payload.project?.name?.trim() || '';
  const advice = latestSupportAdvice(ticket);
  const contact = payload.reportedByContact;
  const logoUrl = PRINT_LOGO_SRC;

  return `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><title>ใบแจ้งผลการแก้ไขให้ลูกค้า</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
body{margin:0;background:#e7eeeb;color:#1c2b28;font-family:Sarabun,"Segoe UI",sans-serif}
.sheet{position:relative;max-width:820px;margin:0 auto 2.5rem;background:#fff;padding:1.75rem 2rem 1.5rem;box-shadow:0 10px 28px rgba(28,43,40,.08)}
.head{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding-bottom:.55rem;border-bottom:2px solid #0f766e}
.brand{display:flex;align-items:center;gap:.55rem}
.brand img{width:36px;height:36px;object-fit:contain}
.brand strong{display:block;font-size:1rem}
.brand span{display:block;color:#5b6762;font-size:.78rem}
.docno{text-align:right}
.docno span{display:block;color:#5b6762;font-size:.72rem}
.docno strong{display:block;color:#0f766e;font-size:1.05rem}
.party{display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;margin:.7rem 0 .45rem}
.box h3{margin:0 0 .15rem;color:#5b6762;font-size:.72rem;font-weight:600}
.who{margin:0 0 .15rem;font-size:1rem;font-weight:700}
.kv{display:grid;grid-template-columns:5.2rem 1fr;gap:.05rem .4rem;margin:0;font-size:.84rem}
.kv dt{color:#5b6762}
.kv dd{margin:0}
.terms{width:100%;border-collapse:collapse;margin-top:.35rem}
.terms th,.terms td{padding:.28rem .1rem;border-bottom:1px solid #e4ebe8;text-align:left;vertical-align:top;font-size:.86rem}
.terms th{width:24%;color:#5b6762;font-weight:600}
.terms td{white-space:pre-wrap}
.advice{margin:.55rem 0 0}
.advice h3{margin:0 0 .15rem;font-size:.78rem;color:#1c2b28}
.advice p{margin:0;white-space:pre-wrap;font-size:.86rem}
.note{margin:.4rem 0 0;color:#5b6762;font-size:.78rem}
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
<div class="toolbar"><button class="print-btn" type="button" onclick="window.print()">พิมพ์</button></div>
<div class="sheet">
<header class="head">
  <div class="brand">
    <img src="${escapeHtml(logoUrl)}" alt="Code Chill">
    <div><strong>Code Chill</strong><span>ใบแจ้งผลการแก้ไขให้ลูกค้า</span></div>
  </div>
</header>
<div class="party">
  <section class="box">
    <h3>ลูกค้า</h3>
    <p class="who">${escapeHtml(payload.customer.name)}</p>
    <dl class="kv">
      <dt>โทร</dt><dd>${escapeHtml(payload.customer.phone || '—')}</dd>
      ${contact ? `<dt>ผู้แจ้ง</dt><dd>${escapeHtml(contact.name)}${contact.phone ? ' · ' + escapeHtml(contact.phone) : ''}</dd>` : ''}
    </dl>
  </section>
  <section class="box">
    <h3>งานครั้งที่ ${r.round}</h3>
    <p class="who">${escapeHtml(resultLabel)}</p>
    <dl class="kv"><dt>แก้เสร็จ</dt><dd>${escapeHtml(resolvedAt)}</dd></dl>
  </section>
</div>
<table class="terms"><tbody>
<tr><th>เรื่องที่แจ้ง</th><td>${escapeHtml(payload.ticket.title)}${projectLabel ? ' · ' + escapeHtml(projectLabel) : ''}</td></tr>
<tr><th>สาเหตุ</th><td>${escapeHtml(r.rootCause?.trim() || '—')}</td></tr>
<tr><th>สิ่งที่แก้ไข</th><td>${escapeHtml(r.detail?.trim() || '—')}</td></tr>
</tbody></table>
${
  advice
    ? `<section class="advice"><h3>สิ่งที่ต้องบอกลูกค้าเพิ่ม</h3><p>${escapeHtml(advice)}</p></section>`
    : '<p class="note">ไม่มีคำแนะนำเพิ่มจากแอดมิน — แจ้งผลการแก้ไขด้านบนได้เลย</p>'
}
<p class="note">ใบนี้ไว้สำหรับอ่านหรือส่งให้ลูกค้า การกดพิมพ์ไม่ได้บันทึกว่าบอกลูกค้าแล้ว</p>
<footer class="foot"><span>ใบนี้สำหรับแจ้งลูกค้า</span><span>Code Chill · ใบแจ้งผลการแก้ไขให้ลูกค้า</span></footer>
</div>
</body></html>`;
}

/** หมายเหตุล่าสุดที่แอดมินฝากถึงซัพพอร์ตตอนส่งกลับ เช่น ให้ล้างแคช */
function latestSupportAdvice(ticket: Ticket): string | null {
  const notes = (ticket.history ?? [])
    .filter((h) => h.code === 'RETURNED_TO_SUPPORT' && h.note?.trim())
    .map((h) => h.note!.trim());
  return notes.length ? notes[notes.length - 1] : null;
}

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
