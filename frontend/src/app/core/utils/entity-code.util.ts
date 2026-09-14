/**
 * รหัส entity — Backend เป็น source of truth · FE ห้าม generate
 *
 * รูปแบบที่คาดหวัง (ข้อมูลเก่าอาจเป็น null / รูปแบบอื่น — แสดงตามที่ API ส่ง):
 * - ลูกค้า:     CUS-001
 * - โปรเจค:     PRJ-2026-001
 * - Ticket:     TK-2026-001
 * - MA Contract: MA-2026-001
 * - Warranty:   WAR-2026-001  (API อาจส่ง `code` หรือ `warrantyNo`)
 * - Delivery:   DLV-PRJ-2026-001-01
 */

/** แสดงรหัสบน UI — ค่าว่าง/null → fallback (ค่าเริ่มต้น "—") */
export function displayEntityCode(
  value: string | null | undefined,
  empty = '—'
): string {
  if (value == null) {
    return empty;
  }
  const trimmed = String(value).trim();
  return trimmed === '' ? empty : trimmed;
}

/** ข้อความ snackbar หลังสร้างเมื่อมีรหัสจาก BE */
export function createdWithCodeMessage(
  base: string,
  code: string | null | undefined
): string {
  const shown = displayEntityCode(code, '');
  return shown ? `${base} · ${shown}` : base;
}
