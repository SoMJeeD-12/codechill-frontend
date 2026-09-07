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

  override format(date: Date, displayFormat: Record<string, string>): string {
    if (!this.isValid(date)) {
      return '';
    }

    const day = this.getDate(date);
    const month = this.getMonth(date);
    const year = this.getYear(date);

    const monthStyle = displayFormat['month'];
    const dayStyle = displayFormat['day'];
    const yearStyle = displayFormat['year'];

    // หัวปฏิทินแบบเดือน+ปี เช่น "มี.ค. 2026"
    if (!dayStyle && monthStyle && yearStyle) {
      const monthName =
        monthStyle === 'long' ? THAI_MONTHS_LONG[month] : THAI_MONTHS_SHORT[month];
      return `${monthName} ${year}`;
    }

    // ค่าในช่องกรอก เช่น "7 ก.ย. 2026"
    const monthName =
      monthStyle === 'long' ? THAI_MONTHS_LONG[month] : THAI_MONTHS_SHORT[month];
    return `${day} ${monthName} ${year}`;
  }
}

export const THAI_CE_DATE_FORMATS = {
  parse: {
    dateInput: { day: 'numeric', month: 'short', year: 'numeric' },
  },
  display: {
    dateInput: { day: 'numeric', month: 'short', year: 'numeric' },
    monthYearLabel: { month: 'short', year: 'numeric' },
    dateA11yLabel: { day: 'numeric', month: 'long', year: 'numeric' },
    monthYearA11yLabel: { month: 'long', year: 'numeric' },
  },
};
