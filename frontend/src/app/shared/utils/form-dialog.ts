/** ขนาด popup ฟอร์มกรอกข้อมูล — ใช้ร่วมกันทั้งแอป */

const FORM_DIALOG_PANEL = 'app-form-dialog';

/** ฟอร์มใหญ่ 2 คอลัมน์ (โปรเจค · ใบแจ้งปัญหา · บทบาท ฯลฯ) */
export const FORM_DIALOG_WIDE = {
  width: '1280px',
  maxWidth: '98vw',
  maxHeight: '96vh',
  panelClass: FORM_DIALOG_PANEL,
} as const;

/**
 * ฟอร์มกรอกข้อมูลทั่วไป (MA · ลูกค้า · ติดตาม · ส่งมอบ · ประกัน ฯลฯ)
 * กว้างพอให้เห็นหลายฟิลด์พร้อมกัน / เลย์เอาต์ 2 คอลัมน์
 */
export const FORM_DIALOG = {
  width: '1120px',
  maxWidth: '96vw',
  maxHeight: '94vh',
  panelClass: FORM_DIALOG_PANEL,
} as const;

/** ฟอร์มสั้น / ขั้นตอนย่อย (มอบหมาย · ยอมรับส่งมอบ · แก้เมตาเอกสาร) */
export const FORM_DIALOG_COMPACT = {
  width: '720px',
  maxWidth: '96vw',
  maxHeight: '90vh',
  panelClass: FORM_DIALOG_PANEL,
} as const;
