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
    return '09:00';
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    return '09:00';
  }
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** รวมวันที่จากปฏิทินกับเวลา HH:mm เป็น ISO */
export function combineDateAndTime(
  date: Date | null | undefined,
  time: string | null | undefined
): string {
  const base = date ? new Date(date) : new Date();
  const [hh, mm] = (time || '00:00').split(':').map((part) => Number(part) || 0);
  base.setHours(hh, mm, 0, 0);
  return base.toISOString();
}

export function nowTimeString(): string {
  return toTimeString(new Date());
}
