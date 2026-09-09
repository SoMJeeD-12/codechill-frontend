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

/** pattern สำหรับช่องกรอกเวลาไทย */
export const THAI_TIME_PATTERN = /^\d{1,2}[.:]\d{2}$/;

const THAI_MONTHS_SHORT = [
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

function asValidDate(value: Date | string | null | undefined): Date | null {
  if (value == null || value === '') {
    return null;
  }
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** เวลาแบบไทย เช่น 15.30 น. */
export function formatThaiTime(value: Date | string | null | undefined): string {
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
  const d = asValidDate(value);
  if (!d) {
    return '';
  }
  return `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()} ${formatThaiTime(d)}`;
}

/** เฉพาะวันที่ เช่น 9 ก.ย. 2026 */
export function formatThaiDate(value: Date | string | null | undefined): string {
  const d = asValidDate(value);
  if (!d) {
    return '';
  }
  return `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}
