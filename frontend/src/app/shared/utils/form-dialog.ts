/** ขนาด popup ฟอร์มกรอกข้อมูล — ใช้ร่วมกันทั้งแอป */

/** ฟอร์มใหญ่ 2 คอลัมน์ (เช่น สร้างโปรเจค) */
export const FORM_DIALOG_WIDE = {
  width: '1200px',
  maxWidth: '96vw',
  maxHeight: '92vh',
} as const;

/** ฟอร์มกรอกข้อมูลทั่วไป (เปิดใบ · ลูกค้า · ติดตาม · ส่งมอบ ฯลฯ) */
export const FORM_DIALOG = {
  width: '800px',
  maxWidth: '96vw',
  maxHeight: '92vh',
} as const;

/** ฟอร์มสั้น / ขั้นตอนย่อย (มอบหมาย · ยอมรับส่งมอบ · แก้เมตาเอกสาร) */
export const FORM_DIALOG_COMPACT = {
  width: '640px',
  maxWidth: '96vw',
  maxHeight: '90vh',
} as const;
