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

/**
 * กรอง/จัดรูปขณะพิมพ์: เก็บเฉพาะตัวเลข จุดทศนิยม คอมม่า
 * คืนค่าข้อความที่จัดรูปแล้ว
 */
export function sanitizeMoneyTyping(raw: string, allowDecimal = true): string {
  let s = raw.replace(/[^\d.,]/g, '');
  if (!allowDecimal) {
    s = s.replace(/\./g, '');
  }
  s = s.replace(/,/g, '');

  if (allowDecimal) {
    const firstDot = s.indexOf('.');
    if (firstDot >= 0) {
      const intPart = s.slice(0, firstDot).replace(/\D/g, '') || '0';
      let decPart = s.slice(firstDot + 1).replace(/\D/g, '').slice(0, 2);
      // อนุญาตพิมพ์จุดค้างไว้ตอนยังไม่ใส่ทศนิยม
      if (raw.includes('.') && decPart === '' && !/\.\d/.test(raw.replace(/,/g, ''))) {
        return `${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.`;
      }
      const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return decPart.length ? `${formattedInt}.${decPart}` : formattedInt;
    }
  }

  const digits = s.replace(/\D/g, '');
  if (!digits) {
    return '';
  }
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
