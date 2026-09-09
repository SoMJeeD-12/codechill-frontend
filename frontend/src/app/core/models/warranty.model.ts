export type WarrantyStatus = 'ACTIVE' | 'EXPIRED' | 'VOID';

export interface WarrantyDeliverySummary {
  id: number;
  title: string;
  version: string | null;
  deliveredAt: string;
}

export interface WarrantyProjectSummary {
  id: number;
  name: string;
  customerId: number;
  customerName: string | null;
}

/** WarrantyResponseDto */
export interface Warranty {
  id: number;
  deliveryId: number;
  delivery: WarrantyDeliverySummary | null;
  projectId: number;
  project: WarrantyProjectSummary | null;
  durationMonth: number;
  startDate: string;
  endDate: string;
  status: WarrantyStatus;
  isCurrentlyActive: boolean;
  daysRemaining: number;
  scopeNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export const WARRANTY_STATUS_LABELS: Record<WarrantyStatus, string> = {
  ACTIVE: 'ใช้งานอยู่',
  EXPIRED: 'หมดอายุ',
  VOID: 'ยกเลิก',
};

/** จำนวนวันก่อนหมดอายุที่ถือว่าใกล้หมด (ค่าเริ่มต้นของ API) */
export const WARRANTY_NEAR_EXPIRY_DAYS = 30;
