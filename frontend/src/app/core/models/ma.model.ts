/** สถานะสัญญา MA — รอ map กับ backend Phase 8 */
export type MaContractStatus = 'DRAFT' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED';

/**
 * แม่แบบแผน MA (เนื้อหาเดียวกัน ราคา/โควตาตั้งต่อสัญญาได้)
 * เส้นทางที่คาดไว้: GET/POST /api/ma-plans
 */
export interface MaPlan {
  id: number;
  code: string;
  name: string;
  description: string | null;
  /** ค่าแนะนำเริ่มต้น — สัญญาจริงอาจตั้งราคาต่างกันต่อโครงการ */
  defaultAnnualFee: number;
  defaultQuotaTotal: number;
  defaultSlaHours: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * สัญญา MA ต่อลูกค้า/โครงการ
 * เส้นทางที่คาดไว้: /api/ma-contracts
 */
export interface MaContract {
  id: number;
  contractNo: string | null;
  customerId: number;
  projectId: number | null;
  planId: number | null;
  planName: string;
  startDate: string;
  endDate: string;
  status: MaContractStatus;
  annualFee: number;
  /** โควตาเคสซ่อม/ปี */
  quotaTotal: number;
  quotaUsed: number;
  /** SLA ตอบรับ (ชั่วโมง) */
  slaHours: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Add-on โควตา/แพ็กเสริมของสัญญา
 * เส้นทางที่คาดไว้: POST /api/ma-contracts/:id/addons
 */
export interface MaAddon {
  id: number;
  contractId: number;
  name: string;
  quantity: number;
  usedQuantity: number;
  unitPrice: number;
  purchasedAt: string;
}

/** สรุปโควตา — รูปแบบที่ tickets resolution อาจคืนมา (QuotaSummaryDto) */
export interface MaQuotaSummary {
  contractId: number;
  quotaTotal: number;
  quotaUsed: number;
  remaining: number;
}

export const MA_STATUS_LABELS: Record<MaContractStatus, string> = {
  DRAFT: 'แบบร่าง',
  ACTIVE: 'ใช้งานอยู่',
  EXPIRED: 'หมดอายุ',
  CANCELLED: 'ยกเลิก',
};
