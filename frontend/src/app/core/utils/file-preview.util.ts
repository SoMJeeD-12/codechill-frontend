/** สร้างหน้า HTML ตัวอย่างให้เปิดดูได้เมื่อยังไม่มีไฟล์จริง / รอ Phase 9 */
export function buildFilePreview(
  fileName: string,
  version: string,
  note = ''
): string {
  const html = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(fileName)}</title>
  <style>
    body { font-family: Sarabun, Segoe UI, sans-serif; margin: 0; padding: 2rem; background: #f4f1ea; color: #1c2b28; }
    .card { max-width: 720px; margin: 0 auto; background: #fff; border-radius: 16px; padding: 1.5rem 1.75rem; border: 1px solid #d8e5e1; box-shadow: 0 8px 24px rgba(28,43,40,.06); }
    h1 { margin: 0 0 .35rem; font-size: 1.35rem; }
    .meta { color: #0f766e; font-weight: 600; margin: 0 0 1rem; }
    .note { color: #5b6762; line-height: 1.5; }
    hr { border: 0; border-top: 1px solid #e4eeeb; margin: 1.25rem 0; }
    .hint { font-size: .9rem; color: #5b6762; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(fileName)}</h1>
    <p class="meta">เวอร์ชัน ${escapeHtml(version)} · ไฟล์ตัวอย่าง (mock Phase 9)</p>
    <p class="note">${escapeHtml(note || 'ไม่มีหมายเหตุ')}</p>
    <hr />
    <p class="hint">ในระบบจริง ไฟล์นี้จะเปิดหรือดาวน์โหลดจาก Cloudflare R2 ผ่าน /api/files</p>
  </div>
</body>
</html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
