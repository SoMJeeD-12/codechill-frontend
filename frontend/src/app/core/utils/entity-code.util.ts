/**
 * รหัส entity — Backend เป็น source of truth · FE ห้ามออกรหัสเอง
 *
 * รูปแบบสั้นที่ BE ออกให้ (ปี ค.ศ. 2026 → พ.ศ. สองหลัก = 69):
 * - ใบปัญหา:  ticketNo   = TK69-0006  (ห้ามใช้ REC)
 * - ลูกค้า:   code       = CUS69-0001
 * - โปรเจกต์:   code       = PRJ69-0001
 * - ส่งมอบ:   deliveryNo = DLV69-0001
 * - ประกัน:   warrantyNo = WAR69-0001  (ห้ามอ่าน warranty.code)
 * - สัญญา MA: contractNo = MA69-0014
 *
 * แถวเก่าอาจยังเป็น PRJ-2026-001 / TK-2026-… — แสดงตามค่าที่ API ส่งมา ไม่แปลง
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
