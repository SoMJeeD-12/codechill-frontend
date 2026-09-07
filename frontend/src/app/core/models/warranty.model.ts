export type WarrantyCoverage = 'SOFTWARE' | 'HARDWARE' | 'BOTH';

export type WarrantyStatus = 'ACTIVE' | 'EXPIRED' | 'VOID';

export interface Warranty {
  id: number;
  customerId: number;
  projectId: number | null;
  /** อ้างอิงการส่งมอบที่เริ่มนับประกัน (ถ้ามี) */
  deliveryId: number | null;
  title: string;
  coverage: WarrantyCoverage;
  startDate: string;
  endDate: string;
  status: WarrantyStatus;
  note: string;
}

export const WARRANTY_COVERAGE_LABELS: Record<WarrantyCoverage, string> = {
  SOFTWARE: 'ซอฟต์แวร์',
  HARDWARE: 'ฮาร์ดแวร์',
  BOTH: 'ซอฟต์แวร์ + ฮาร์ดแวร์',
};

export const WARRANTY_STATUS_LABELS: Record<WarrantyStatus, string> = {
  ACTIVE: 'ใช้งานอยู่',
  EXPIRED: 'หมดอายุ',
  VOID: 'ยกเลิก',
};

/** จำนวนวันก่อนหมดอายุที่ถือว่าใกล้หมด */
export const WARRANTY_NEAR_EXPIRY_DAYS = 30;
