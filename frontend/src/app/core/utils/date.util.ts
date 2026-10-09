/** แปลง Date เป็น YYYY-MM-DD ตามเวลาท้องถิ่น */
export function toDateOnlyString(value: Date | string | null | undefined): string {
  if (!value) {
    return '';
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** แปลง YYYY-MM-DD หรือ ISO เป็น Date ท้องถิ่น (ตัดเวลา) */
export function parseDateOnly(value: string | Date | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const datePart = value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (!match) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const y = Number(match[1]);
  const m = Number(match[2]);
  const day = Number(match[3]);
  return new Date(y, m - 1, day);
}

export function toTimeString(value: Date | string | null | undefined): string {
  if (!value) {
    return '09.00';
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    return '09.00';
  }
  return `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
}

/** แยกชม./นาที จาก 15.30 / 15:30 / 15.30 น. */
export function parseTimeParts(
  time: string | null | undefined
): { hours: number; minutes: number } {
  const raw = (time ?? '00.00')
    .replace(/น\.?/g, '')
    .replace(/\s/g, '')
    .replace(':', '.');
  const [hPart, mPart = '0'] = raw.split('.');
  const hours = Math.min(23, Math.max(0, Number(hPart) || 0));
  const minutes = Math.min(59, Math.max(0, Number(mPart) || 0));
  return { hours, minutes };
}

/** รวมวันที่จากปฏิทินกับเวลา HH.mm หรือ HH:mm เป็น ISO */
export function combineDateAndTime(
  date: Date | null | undefined,
  time: string | null | undefined
): string {
  const base = date ? new Date(date) : new Date();
  const { hours, minutes } = parseTimeParts(time);
  base.setHours(hours, minutes, 0, 0);
  return base.toISOString();
}

export function nowTimeString(): string {
  return toTimeString(new Date());
}

/**
 * จำนวนเดือนของสัญญา จาก start ถึง end (นับวันสิ้นสุดรวม)
 * เช่น 1 ม.ค. – 31 ธ.ค. = 12 เดือน
 */
export function contractMonthCount(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined
): number {
  const s = start instanceof Date ? start : parseDateOnly(start);
  const e = end instanceof Date ? end : parseDateOnly(end);
  if (!s || !e || e < s) {
    return 0;
  }
  const endExclusive = new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1);
  const months =
    (endExclusive.getFullYear() - s.getFullYear()) * 12 +
    (endExclusive.getMonth() - s.getMonth());
  return Math.max(0, months);
}

/** บวกเดือนแบบหนีบวันสิ้นเดือน (เช่น 31 ม.ค. + 1 เดือน → 28/29 ก.พ.) */
export function addMonthsClamped(start: Date, months: number): Date {
  const targetMonthIndex = start.getMonth() + months;
  const y = start.getFullYear() + Math.floor(targetMonthIndex / 12);
  const m = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const day = Math.min(start.getDate(), lastDay);
  return new Date(y, m, day);
}

/**
 * วันสิ้นสุดสัญญา = วันเริ่ม + N เดือน − 1 วัน
 * เช่น 1 ต.ค. 2026 + 12 เดือน → 30 ก.ย. 2027
 */
export function contractEndFromDuration(start: Date, months: number): Date {
  const exclusive = addMonthsClamped(start, months);
  return new Date(exclusive.getFullYear(), exclusive.getMonth(), exclusive.getDate() - 1);
}

/** วันถัดไป (ใช้เป็น min ของวันสิ้นสุด) */
export function addDays(start: Date, days: number): Date {
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + days);
}

/** pattern สำหรับช่องกรอกเวลาไทย */
export const THAI_TIME_PATTERN = /^\d{1,2}[.:]\d{2}$/;

export const THAI_MONTHS_SHORT = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" (DATEONLY) ไม่มีเวลา — ห้ามผ่าน new Date() ตรง ๆ (จะกลายเป็น 07.00 น.) */
function isDateOnlyString(value: Date | string | null | undefined): value is string {
  return typeof value === 'string' && DATE_ONLY.test(value.trim());
}

function asValidDate(value: Date | string | null | undefined): Date | null {
  if (value == null || value === '') {
    return null;
  }
  if (isDateOnlyString(value)) {
    return parseDateOnly(value.trim());
  }
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** เวลาแบบไทย เช่น 15.30 น. */
export function formatThaiTime(value: Date | string | null | undefined): string {
  if (isDateOnlyString(value)) {
    return '';
  }
  const d = asValidDate(value);
  if (!d) {
    return '';
  }
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}.${mm} น.`;
}

/** วันเวลาแบบไทย เช่น 9 ก.ย. 2026 15.30 น. */
export function formatThaiDateTime(value: Date | string | null | undefined): string {
  if (isDateOnlyString(value)) {
    return formatThaiDate(value);
  }
  const d = asValidDate(value);
  if (!d) {
    return '';
  }
  return `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()} ${formatThaiTime(d)}`;
}

/**
 * ป้ายช่วงวันแบบสั้น เช่น 5 ก.ย. · 1–7 ก.ย. · 29 ก.ย.–5 ต.ค. · ก.ย. (ทั้งเดือน)
 * withYear = ต่อท้ายปี (ใช้เมื่อช่วงข้ามปี)
 */
export function formatThaiPeriodLabel(
  start: string | Date | null | undefined,
  end: string | Date | null | undefined,
  withYear = false
): string {
  const s = parseDateOnly(start);
  const e = parseDateOnly(end) ?? s;
  if (!s || !e) {
    return '';
  }
  const year = (d: Date) => (withYear ? ` ${d.getFullYear()}` : '');
  const month = (d: Date) => THAI_MONTHS_SHORT[d.getMonth()];
  if (s.getTime() === e.getTime()) {
    return `${s.getDate()} ${month(s)}${year(s)}`;
  }
  const sameMonth = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth();
  const lastOfMonth = new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate();
  if (sameMonth && s.getDate() === 1 && e.getDate() === lastOfMonth) {
    return `${month(s)}${year(s)}`;
  }
  if (sameMonth) {
    return `${s.getDate()}–${e.getDate()} ${month(s)}${year(s)}`;
  }
  const sameYear = s.getFullYear() === e.getFullYear();
  return `${s.getDate()} ${month(s)}${sameYear ? '' : year(s)}–${e.getDate()} ${month(e)}${year(e)}`;
}

/** ช่วงวันเต็ม เช่น 1 ก.ย. – 29 ก.ย. 2026 · 1 ธ.ค. 2025 – 5 ม.ค. 2026 */
export function formatThaiDateRange(
  start: string | Date | null | undefined,
  end: string | Date | null | undefined
): string {
  const s = parseDateOnly(start);
  const e = parseDateOnly(end);
  if (!s || !e) {
    return '';
  }
  const day = (d: Date) => `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]}`;
  if (s.getFullYear() === e.getFullYear()) {
    return `${day(s)} – ${day(e)} ${e.getFullYear()}`;
  }
  return `${day(s)} ${s.getFullYear()} – ${day(e)} ${e.getFullYear()}`;
}

/** เฉพาะวันที่ เช่น 9 ก.ย. 2026 */
export function formatThaiDate(value: Date | string | null | undefined): string {
  const d = asValidDate(value);
  if (!d) {
    return '';
  }
  return `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}
