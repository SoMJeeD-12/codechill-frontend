/** สถานะสัญญา MA — MaContractResponseDto */
export type MaContractStatus = 'DRAFT' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'RENEWED';

export type MaBillingCycle = 'MONTHLY' | 'YEARLY';

export type MaAddonType = 'EXTRA_QUOTA' | 'OTHER';

/** รายการย่อยในแผน — MaPlanItemResponseDto */
export interface MaPlanItem {
  id: number;
  title: string;
  detail: string | null;
  sortOrder: number;
}

/**
 * แม่แบบแผน MA — MaPlanResponseDto
 * แผนไม่มีราคา (BR-05) — ราคาอยู่ที่สัญญา
 */
export interface MaPlan {
  id: number;
  code: string;
  name: string;
  description: string | null;
  /** โควตาเคสต่อรอบเดือน (นับจากวันเริ่มสัญญา) */
  bugQuotaPerMonth: number;
  /** SLA ตอบรับ (ชม.) — แก้ที่แผนอย่างเดียว */
  responseTimeHour: number | null;
  onsiteQuotaPerMonth: number | null;
  isActive: boolean;
  sortOrder: number;
  items: MaPlanItem[];
  createdAt: string;
  updatedAt: string;
}

/** สรุปแผนที่ฝังในสัญญา */
export interface MaContractPlanSummary {
  id: number;
  code: string;
  name: string;
  bugQuotaPerMonth: number;
  responseTimeHour: number | null;
}

/**
 * โครงโควตาร่วม — อ่านได้ทั้ง GET /ma-contracts/:id/quota และ POST .../resolutions
 * ต่างกันแค่ฟิลด์สุดท้ายตามความหมาย: isExhausted | isOverQuota
 */
export interface MaQuotaPeriod {
  contractId: number;
  periodYear: number;
  periodMonth: number;
  /** แสดงจาก backend ห้ามเดาจาก periodMonth */
  periodStart: string;
  periodEnd: string;
  quota: number;
  used: number;
  /** ติดลบได้เมื่อใช้เกิน */
  remaining: number;
}

/** QuotaStatusResponseDto — สถานะโควตารอบปัจจุบันของสัญญา */
export interface MaQuotaStatus extends MaQuotaPeriod {
  /** โควตาในรอบนี้หมดแล้ว (เหลือ ≤ 0) */
  isExhausted: boolean;
}

/** QuotaSummaryDto — โควตาที่พ่วงตอนบันทึกรอบแก้ (MA_QUOTA) */
export interface TicketQuotaSummary extends MaQuotaPeriod {
  /** การหักครั้งนี้ทำให้เกินโควตาหรือไม่ */
  isOverQuota: boolean;
}

/**
 * สัญญา MA — MaContractResponseDto
 * ผูกโครงการเสมอ · customerId ดึงจากโครงการตอนสร้าง
 */
export interface MaContract {
  id: number;
  customerId: number;
  customerName: string | null;
  projectId: number;
  projectName: string | null;
  planId: number;
  plan: MaContractPlanSummary | null;
  contractNo: string | null;
  /** DECIMAL เป็น string */
  price: string;
  billingCycle: MaBillingCycle;
  startDate: string;
  endDate: string;
  status: MaContractStatus;
  /** ใช้แสดงสถานะจริงจนกว่า Phase 11 มี scheduler */
  isCurrentlyActive: boolean;
  /** ติดลบ = หมดอายุแล้ว */
  daysUntilExpiry: number;
  signedDate: string | null;
  signedFileUrl: string | null;
  previousContractId: number | null;
  note: string | null;
  addons?: MaAddon[];
  /** พ่วงตอน GET by id */
  quota?: MaQuotaStatus | null;
  createdAt: string;
  updatedAt: string;
}

/** Add-on — MaAddonResponseDto */
export interface MaAddon {
  id: number;
  contractId: number;
  addonType: MaAddonType;
  title: string;
  extraQuota: number;
  price: string;
  effectiveYear: number | null;
  effectiveMonth: number | null;
  note: string | null;
  createdAt: string;
}

export const MA_STATUS_LABELS: Record<MaContractStatus, string> = {
  DRAFT: 'แบบร่าง',
  ACTIVE: 'ใช้งานอยู่',
  EXPIRED: 'หมดอายุ',
  CANCELLED: 'ยกเลิก',
  RENEWED: 'ต่ออายุแล้ว',
};

export const MA_BILLING_CYCLE_LABELS: Record<MaBillingCycle, string> = {
  MONTHLY: 'รายเดือน',
  YEARLY: 'รายปี',
};

export function maPlanDisplayName(contract: MaContract): string {
  return contract.plan?.name ?? `#${contract.planId}`;
}

export function maSlaHours(contract: MaContract): number | null {
  return contract.plan?.responseTimeHour ?? null;
}
