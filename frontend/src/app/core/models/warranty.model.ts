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

/** สรุปสัญญา MA ที่อ้างอิงจากประกัน — ไม่ใช่โควตา/ราคาของประกัน */
export interface WarrantyMaContractSummary {
  id: number;
  contractNo: string | null;
  status: string;
  planCode: string | null;
  planName: string | null;
}

/** WarrantyResponseDto */
export interface Warranty {
  id: number;
  /** รหัสที่ Backend ออก — field ชื่อ warrantyNo เท่านั้น (ไม่มี warranty.code) */
  warrantyNo: string | null;
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
  /** อ้างอิงสัญญา MA ของโปรเจคเดียวกัน — ไม่บังคับ · ไม่คิดรวมโควตา */
  maContractId: number | null;
  maContract: WarrantyMaContractSummary | null;
  createdAt: string;
  updatedAt: string;
}

/** ข้อความแสดงการผูก MA — อ้างอิงชื่อแผนเท่านั้น */
export function warrantyMaLinkLabel(w: Pick<Warranty, 'maContractId' | 'maContract'>): string {
  const planName = w.maContract?.planName?.trim();
  if (w.maContractId && planName) {
    return `ผูก MA: ${planName}`;
  }
  if (w.maContractId && w.maContract?.contractNo) {
    return `ผูก MA: ${w.maContract.contractNo}`;
  }
  return 'ไม่ได้ผูก MA';
}

export const WARRANTY_STATUS_LABELS: Record<WarrantyStatus, string> = {
  ACTIVE: 'ใช้งานอยู่',
  EXPIRED: 'หมดอายุ',
  VOID: 'ยกเลิก',
};

/** จำนวนวันก่อนหมดอายุที่ถือว่าใกล้หมด (ค่าเริ่มต้นของ API) */
export const WARRANTY_NEAR_EXPIRY_DAYS = 30;
