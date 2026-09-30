import { Injectable } from '@angular/core';
import { NativeDateAdapter } from '@angular/material/core';

const THAI_MONTHS_LONG = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

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

const THAI_DAYS_LONG = [
  'อาทิตย์',
  'จันทร์',
  'อังคาร',
  'พุธ',
  'พฤหัสบดี',
  'ศุกร์',
  'เสาร์',
];

const THAI_DAYS_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const THAI_DAYS_NARROW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

/** DateAdapter ภาษาไทย + ปี ค.ศ. (ไม่ใช้ พ.ศ.) */
@Injectable()
export class ThaiCeDateAdapter extends NativeDateAdapter {
  override getYearName(date: Date): string {
    return String(this.getYear(date));
  }

  override getMonthNames(style: 'long' | 'short' | 'narrow'): string[] {
    return style === 'long' ? [...THAI_MONTHS_LONG] : [...THAI_MONTHS_SHORT];
  }

  override getDayOfWeekNames(style: 'long' | 'short' | 'narrow'): string[] {
    if (style === 'long') {
      return [...THAI_DAYS_LONG];
    }
    if (style === 'short') {
      return [...THAI_DAYS_SHORT];
    }
    return [...THAI_DAYS_NARROW];
  }

  override getFirstDayOfWeek(): number {
    return 0; // อาทิตย์
  }

  /**
   * ต้อง parse ข้อความไทยที่ format() เขียนกลับได้
   * ไม่งั้นเลือกวันจากปฏิทินแล้ว blur แล้วช่องว่าง
   */
  override parse(value: unknown): Date | null {
    if (value == null || value === '') {
      return null;
    }
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return new Date(value);
    }
    if (value instanceof Date) {
      return this.isValid(value) ? value : null;
    }
    if (typeof value !== 'string') {
      return super.parse(value);
    }

    const text = value.trim();
    if (!text) {
      return null;
    }

    // YYYY-MM-DD
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
    if (iso) {
      return this.createDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    }

    // D/M/YYYY หรือ D-M-YYYY
    const numeric = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
    if (numeric) {
      return this.createDate(Number(numeric[3]), Number(numeric[2]) - 1, Number(numeric[1]));
    }

    // "7 ก.ย. 2026" หรือ "7 กันยายน 2026"
    const thai = /^(\d{1,2})\s+([^\s\d]+)\s+(\d{4})$/.exec(text);
    if (thai) {
      const day = Number(thai[1]);
      const year = Number(thai[3]);
      const monthToken = thai[2];
      const month = this.monthIndexFromThai(monthToken);
      if (month !== null) {
        return this.createDate(year, month, day);
      }
    }

    // "ก.ย. 2026" (เดือน+ปี)
    const monthYear = /^([^\s\d]+)\s+(\d{4})$/.exec(text);
    if (monthYear) {
      const month = this.monthIndexFromThai(monthYear[1]);
      const year = Number(monthYear[2]);
      if (month !== null) {
        return this.createDate(year, month, 1);
      }
    }

    const fallback = new Date(text);
    return this.isValid(fallback) ? fallback : null;
  }

  override format(date: Date, displayFormat: Record<string, string> | string): string {
    if (!this.isValid(date)) {
      return '';
    }

    const day = this.getDate(date);
    const month = this.getMonth(date);
    const year = this.getYear(date);

    const fmt =
      typeof displayFormat === 'string'
        ? { day: 'numeric', month: 'short', year: 'numeric' }
        : displayFormat || { day: 'numeric', month: 'short', year: 'numeric' };

    const monthStyle = fmt['month'];
    const dayStyle = fmt['day'];
    const yearStyle = fmt['year'];

    // หัวปฏิทินแบบเดือน+ปี เช่น "มี.ค. 2026"
    if (!dayStyle && monthStyle && yearStyle) {
      const monthName =
        monthStyle === 'long' ? THAI_MONTHS_LONG[month] : THAI_MONTHS_SHORT[month];
      return `${monthName} ${year}`;
    }

    // ค่าในช่องกรอกแบบตัวเลข dd/mm/yyyy — parse() อ่านกลับได้
    if (monthStyle === '2-digit') {
      return `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`;
    }

    // ค่าในช่องกรอก เช่น "7 ก.ย. 2026"
    const monthName =
      monthStyle === 'long' ? THAI_MONTHS_LONG[month] : THAI_MONTHS_SHORT[month];
    return `${day} ${monthName} ${year}`;
  }

  private monthIndexFromThai(token: string): number | null {
    const normalized = token.trim();
    const longIdx = THAI_MONTHS_LONG.indexOf(normalized);
    if (longIdx >= 0) {
      return longIdx;
    }
    const shortIdx = THAI_MONTHS_SHORT.indexOf(normalized);
    if (shortIdx >= 0) {
      return shortIdx;
    }
    // เผื่อพิมพ์โดยไม่มีจุด เช่น "ก.ย"
    const loose = THAI_MONTHS_SHORT.findIndex(
      (m) => m.replace(/\./g, '') === normalized.replace(/\./g, '')
    );
    return loose >= 0 ? loose : null;
  }
}

export const THAI_CE_DATE_FORMATS = {
  parse: {
    dateInput: null,
  },
  display: {
    dateInput: { day: 'numeric', month: 'short', year: 'numeric' },
    monthYearLabel: { month: 'short', year: 'numeric' },
    dateA11yLabel: { day: 'numeric', month: 'long', year: 'numeric' },
    monthYearA11yLabel: { month: 'long', year: 'numeric' },
  },
};

/** ช่องกรอกวันที่แบบตัวเลข dd/mm/yyyy (ค.ศ.) — ใช้ผ่าน providers ของคอมโพเนนต์ */
export const THAI_CE_NUMERIC_DATE_FORMATS = {
  ...THAI_CE_DATE_FORMATS,
  display: {
    ...THAI_CE_DATE_FORMATS.display,
    dateInput: { day: '2-digit', month: '2-digit', year: 'numeric' },
  },
};
