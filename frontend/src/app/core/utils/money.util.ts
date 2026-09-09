/** จัดรูปแบบตัวเลขเงินให้มีคอมม่าคั่นหลักพัน (รองรับทศนิยม) */
export function formatMoneyDisplay(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  const parsed = typeof value === 'number' ? value : parseMoneyValue(String(value));
  if (parsed === null || Number.isNaN(parsed)) {
    return '';
  }
  const negative = parsed < 0;
  const abs = Math.abs(parsed);
  const [intPart, decPart] = abs.toString().split('.');
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const formatted = decPart != null ? `${withCommas}.${decPart}` : withCommas;
  return negative ? `-${formatted}` : formatted;
}

/** ส่งเงินเป็น string ทศนิยม 2 ตำแหน่ง (DECIMAL ของ backend) */
export function toMoneyString(value: number | string | null | undefined, empty = '0.00'): string {
  if (value === null || value === undefined || value === '') {
    return empty;
  }
  const n = typeof value === 'number' ? value : parseMoneyValue(String(value));
  if (n === null || Number.isNaN(n)) {
    return empty;
  }
  return n.toFixed(2);
}

/** แปลงข้อความที่มีคอมม่าเป็นตัวเลข — ว่าง = null */
export function parseMoneyValue(raw: string | null | undefined): number | null {
  if (raw == null) {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '-' || trimmed === '.' || trimmed === '-.') {
    return null;
  }
  const cleaned = trimmed.replace(/,/g, '');
  if (!/^-?\d*\.?\d*$/.test(cleaned)) {
    return null;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** ตัด 0 นำหน้า เช่น 0120 → 120, 000 → 0, ว่าง → ว่าง */
function normalizeIntDigits(digits: string): string {
  if (!digits) {
    return '';
  }
  const stripped = digits.replace(/^0+/, '');
  return stripped === '' ? '0' : stripped;
}

function withThousandCommas(intDigits: string): string {
  if (!intDigits) {
    return '';
  }
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * กรอง/จัดรูปขณะพิมพ์: ตัวเลข + คอมม่า + ทศนิยม (ตัด 0 นำหน้า)
 */
export function sanitizeMoneyTyping(raw: string, allowDecimal = true): string {
  let s = raw.replace(/[^\d.]/g, '');
  if (!allowDecimal) {
    s = s.replace(/\./g, '');
  }

  if (allowDecimal) {
    const firstDot = s.indexOf('.');
    if (firstDot >= 0) {
      const intRaw = s.slice(0, firstDot).replace(/\D/g, '');
      const intPart = normalizeIntDigits(intRaw) || '0';
      const decPart = s.slice(firstDot + 1).replace(/\D/g, '').slice(0, 2);
      // อนุญาตพิมพ์จุดค้าง เช่น 0. หรือ 120.
      if (raw.includes('.') && decPart === '') {
        return `${withThousandCommas(intPart)}.`;
      }
      return decPart.length
        ? `${withThousandCommas(intPart)}.${decPart}`
        : withThousandCommas(intPart);
    }
  }

  const digits = normalizeIntDigits(s.replace(/\D/g, ''));
  if (!digits) {
    return '';
  }
  // อย่าแสดง 0 ค้างถ้าผู้ใช้ลบจนว่างแล้วเหลือแค่ 0 จาก normalize — เก็บ 0 ได้ตามปกติ
  return withThousandCommas(digits);
}
