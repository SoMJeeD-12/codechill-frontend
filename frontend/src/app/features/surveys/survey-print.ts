import { MatSnackBar } from '@angular/material/snack-bar';
import {
  QUESTION_TYPE_LABELS,
  SURVEY_STATUS_LABELS,
  Survey,
  SurveyQuestion,
} from '../../core/models/survey.model';
import { SurveyService } from '../../core/services/survey.service';
import { PRINT_LOGO_SRC } from '../../shared/print/print-logo';

export interface SurveyPrintContext {
  customerName?: string | null;
  projectName?: string | null;
  contactName?: string | null;
}

/** พิมพ์แบบฟอร์มเปล่าให้ลูกค้าเลือกคำตอบบนกระดาษ */
export function printSurveyForm(
  api: SurveyService,
  snack: MatSnackBar,
  surveyId: number,
  context?: SurveyPrintContext
): void {
  const win = window.open('', '_blank');
  if (!win) {
    snack.open('เบราว์เซอร์บล็อกหน้าต่างพิมพ์แบบประเมิน', 'ปิด', { duration: 3500 });
    return;
  }
  win.document.write(
    '<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><title>แบบประเมิน</title></head>' +
      '<body style="font-family:Sarabun,sans-serif;padding:36px">กำลังเตรียมแบบประเมิน…</body></html>'
  );
  win.document.close();
  api.get(surveyId).subscribe({
    next: (survey) => {
      win.document.open();
      win.document.write(buildSurveyPrintHtml(survey, context));
      win.document.close();
    },
    error: (err: Error) => {
      win.close();
      snack.open(err.message || 'โหลดแบบประเมินไม่สำเร็จ', 'ปิด', { duration: 4000 });
    },
  });
}

function buildSurveyPrintHtml(survey: Survey, context?: SurveyPrintContext): string {
  const logoUrl = PRINT_LOGO_SRC;
  const watermark = survey.status === 'DRAFT' ? 'ร่าง' : survey.status === 'CLOSED' ? 'ปิดแล้ว' : null;
  const questions = [...(survey.questions ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id - b.id
  );
  const customer = context?.customerName?.trim() || '';
  const project = context?.projectName?.trim() || '';
  const contact = context?.contactName?.trim() || '';

  return `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><title>${escapeHtml(survey.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
body{margin:0;background:#e7eeeb;color:#1c2b28;font-family:Sarabun,"Segoe UI",sans-serif}
.sheet{position:relative;max-width:820px;margin:0 auto 2.5rem;background:#fff;padding:1.75rem 2rem 1.5rem;box-shadow:0 10px 28px rgba(28,43,40,.08)}
.watermark{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}
.watermark span{font-size:6.5rem;font-weight:800;color:rgba(185,28,28,.12);transform:rotate(-24deg)}
.content{position:relative}
.head{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding-bottom:.9rem;border-bottom:3px solid #0f766e}
.brand{display:flex;align-items:center;gap:.7rem}
.brand img{width:46px;height:46px;object-fit:contain}
.brand strong{display:block;font-size:1.05rem}
.brand span{display:block;color:#5b6762;font-size:.82rem}
.docno{text-align:right;color:#0f766e;font-weight:700}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:.45rem .9rem;margin:1rem 0;padding:.8rem .95rem;border:1px solid #d7e0dc;border-radius:10px;background:#f7fbf9}
.meta div{display:grid;grid-template-columns:4.2rem 1fr;gap:.2rem;align-items:end;font-size:.9rem}
.meta span{color:#5b6762}
.meta b{font-weight:600;border-bottom:1px dotted #9aada6;min-height:1.2rem}
.lead{margin:.2rem 0 .9rem;color:#5b6762;font-size:.88rem}
.q{margin:0 0 .85rem;padding:.75rem .9rem;border:1px solid #e4ebe8;border-radius:10px}
.q h3{margin:0 0 .15rem;font-size:.95rem}
.q .type{color:#5b6762;font-size:.75rem}
.req{color:#0f766e}
.choices{list-style:none;margin:.45rem 0 0;padding:0;display:grid;gap:.35rem}
.choices li{display:flex;align-items:flex-start;gap:.45rem}
.mark{flex:0 0 auto;width:.95rem;height:.95rem;margin-top:.15rem;border:1.5px solid #1c2b28}
.mark--round{border-radius:999px}
.scale{display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.5rem}
.scale span{display:inline-flex;align-items:center;gap:.3rem}
.lines div{height:1.6rem;border-bottom:1px dotted #9aada6;margin-top:.35rem}
.foot{display:flex;justify-content:space-between;gap:1rem;margin-top:1.2rem;padding-top:.55rem;border-top:1px solid #e4ebe8;color:#5b6762;font-size:.72rem}
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
<div class="toolbar"><button class="print-btn" type="button" onclick="window.print()">พิมพ์</button></div>
<div class="sheet">
${watermark ? `<div class="watermark"><span>${escapeHtml(watermark)}</span></div>` : ''}
<div class="content">
<header class="head">
  <div class="brand">
    <img src="${escapeHtml(logoUrl)}" alt="Code Chill">
    <div><strong>Code Chill</strong><span>แบบประเมินความพึงพอใจ</span></div>
  </div>
  <div class="docno">${escapeHtml(SURVEY_STATUS_LABELS[survey.status] ?? survey.status)}</div>
</header>
<h1 style="margin:1rem 0 .25rem;font-size:1.25rem">${escapeHtml(survey.title)}</h1>
${survey.description?.trim() ? `<p class="lead">${escapeHtml(survey.description.trim())}</p>` : ''}
<div class="meta">
  <div><span>ลูกค้า</span><b>${escapeHtml(customer)}</b></div>
  <div><span>โปรเจกต์</span><b>${escapeHtml(project)}</b></div>
  <div><span>ผู้ตอบ</span><b>${escapeHtml(contact)}</b></div>
  <div><span>วันที่</span><b></b></div>
</div>
${questions.length ? questions.map((q, i) => questionHtml(q, i + 1)).join('') : '<p class="lead">แบบประเมินนี้ยังไม่มีคำถาม</p>'}
<footer class="foot"><span>เลือกคำตอบบนกระดาษ แล้วส่งกลับให้ผู้ดูแล</span><span>Code Chill · แบบประเมิน</span></footer>
</div></div>
</body></html>`;
}

function questionHtml(q: SurveyQuestion, no: number): string {
  const required = q.isRequired ? ' <span class="req">*</span>' : '';
  const type = QUESTION_TYPE_LABELS[q.questionType] ?? q.questionType;
  return `<section class="q"><h3>${no}. ${escapeHtml(q.questionText)}${required}</h3><div class="type">${escapeHtml(type)}</div>${answerHtml(q)}</section>`;
}

function answerHtml(q: SurveyQuestion): string {
  if (q.questionType === 'TEXT') {
    return '<div class="lines"><div></div><div></div><div></div></div>';
  }
  if (q.questionType === 'RATING') {
    const min = q.minValue ?? 1;
    const max = q.maxValue ?? 5;
    const span = max - min;
    if (!Number.isFinite(span) || span < 0 || span > 10) {
      return `<p class="type">เขียนคะแนน ${escapeHtml(String(min))}–${escapeHtml(String(max))} <b style="display:inline-block;min-width:4rem;border-bottom:1px dotted #9aada6"></b></p>`;
    }
    const marks = [];
    for (let n = min; n <= max; n += 1) {
      marks.push(`<span><i class="mark mark--round"></i>${n}</span>`);
    }
    return `<div class="scale">${marks.join('')}</div>`;
  }
  const options = (Array.isArray(q.options) ? q.options : [])
    .map((o) => o.trim())
    .filter(Boolean);
  if (!options.length) {
    return '<p class="type">ไม่มีตัวเลือก</p>';
  }
  const round = q.questionType === 'CHOICE';
  return `<ul class="choices">${options
    .map(
      (o) =>
        `<li><i class="mark${round ? ' mark--round' : ''}"></i><span>${escapeHtml(o)}</span></li>`
    )
    .join('')}</ul>`;
}

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
