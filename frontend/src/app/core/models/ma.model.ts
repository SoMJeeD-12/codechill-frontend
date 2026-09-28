/** สถานะสัญญา MA — MaContractResponseDto */
export type MaContractStatus = 'DRAFT' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'RENEWED';

/**
 * สถานะคุ้มครองจริงจาก BE — ห้ามเดาจาก status=ACTIVE หรือเครื่องหมาย daysUntilExpiry อย่างเดียว
 * INACTIVE ไม่คุ้มครอง (ร่าง/ยกเลิก/ต่อแล้ว) · NOT_STARTED ยังไม่ถึงวันเริ่ม
 * IN_FORCE คุ้มครองอยู่ · ENDED เลยวันสิ้นสุดแล้ว
 */
export type MaCoverageState = 'INACTIVE' | 'NOT_STARTED' | 'IN_FORCE' | 'ENDED';

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
  /** แหล่งความจริงของป้ายคุ้มครอง — มีใน GET /ma-contracts/:id */
  coverageState?: MaCoverageState;
  /** true เฉพาะ coverageState === IN_FORCE */
  isCurrentlyActive: boolean;
  /** วันถึง endDate: บวก = ยังไม่ถึงวันสิ้นสุด, ลบ = เลยแล้ว — ห้ามใช้เครื่องหมายอย่างเดียวตัดสินป้ายหมดอายุ */
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

/** GET /projects/:id/ma-quota — โควตา MA ของโปรเจกต์ (ประเภทเดียว) */
export interface ProjectMaQuotaItem {
  contract: MaContract;
  quota: MaQuotaStatus;
}

export interface ProjectMaQuotaResponse {
  projectId: number;
  items: ProjectMaQuotaItem[];
}

export const MA_STATUS_LABELS: Record<MaContractStatus, string> = {
  DRAFT: 'แบบร่าง',
  ACTIVE: 'ใช้งานอยู่',
  EXPIRED: 'หมดอายุ',
  CANCELLED: 'ยกเลิก',
  RENEWED: 'ต่อสัญญาแล้ว',
};

/**
 * สถานะที่เลือกในฟอร์มได้ — EXPIRED ระบบตั้งเองเมื่อเลยวันสิ้นสุด (ส่งไป BE ได้ 400)
 * RENEWED ตั้งผ่านการต่อสัญญาเท่านั้น · จบก่อนกำหนดใช้ CANCELLED
 */
export type MaEditableStatus = 'DRAFT' | 'ACTIVE' | 'CANCELLED';
export const MA_EDITABLE_STATUSES: MaEditableStatus[] = ['DRAFT', 'ACTIVE', 'CANCELLED'];

/** รอบวางบิลเท่านั้น — โควตายังนับรายเดือนเสมอ */
export const MA_BILLING_CYCLE_LABELS: Record<MaBillingCycle, string> = {
  MONTHLY: 'วางบิลรายเดือน',
  YEARLY: 'วางบิลรายปี',
};

export function maPlanDisplayName(contract: MaContract): string {
  return contract.plan?.name ?? `#${contract.planId}`;
}

export function maSlaHours(contract: MaContract): number | null {
  return contract.plan?.responseTimeHour ?? null;
}

/** ใช้ coverageState ถ้ามี — ถ้าไม่มี ห้ามตีความ days > 0 เป็นหมดอายุ */
export function resolveMaCoverageState(
  contract: Pick<
    MaContract,
    'coverageState' | 'status' | 'isCurrentlyActive' | 'daysUntilExpiry' | 'startDate'
  >
): MaCoverageState {
  if (contract.coverageState) {
    return contract.coverageState;
  }
  if (contract.isCurrentlyActive) {
    return 'IN_FORCE';
  }
  if (
    contract.status === 'DRAFT' ||
    contract.status === 'CANCELLED' ||
    contract.status === 'RENEWED'
  ) {
    return 'INACTIVE';
  }
  if (contract.status === 'EXPIRED') {
    return 'ENDED';
  }
  if (contract.daysUntilExpiry > 0 || isStartDateInFuture(contract.startDate)) {
    return 'NOT_STARTED';
  }
  if (contract.daysUntilExpiry < 0) {
    return 'ENDED';
  }
  return 'NOT_STARTED';
}

function isStartDateInFuture(startDate: string | undefined): boolean {
  if (!startDate) {
    return false;
  }
  const start = new Date(`${startDate.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(start.getTime())) {
    return false;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return start.getTime() > today.getTime();
}

export function maCoverageLabel(contract: MaContract): string {
  switch (resolveMaCoverageState(contract)) {
    case 'IN_FORCE':
      return 'ใช้งานอยู่';
    case 'NOT_STARTED':
      return 'ยังไม่เริ่ม';
    case 'ENDED':
      return 'หมดอายุ';
    case 'INACTIVE':
      return maInactiveStatusLabel(contract.status);
  }
}

/** ข้อความวัน — เหลืออีก เฉพาะที่ยังไม่ถึง endDate และยังไม่จบความคุ้มครอง */
export function maCoverageDaysHint(contract: MaContract): string | null {
  const state = resolveMaCoverageState(contract);
  const days = contract.daysUntilExpiry;
  if (typeof days !== 'number' || Number.isNaN(days)) {
    return null;
  }
  if (state === 'ENDED') {
    const past = Math.abs(days);
    return past > 0 ? `เลยมา ${past} วัน` : null;
  }
  if ((state === 'NOT_STARTED' || state === 'IN_FORCE') && days > 0) {
    return `เหลืออีก ${days} วัน`;
  }
  return null;
}

function maInactiveStatusLabel(status: MaContractStatus): string {
  switch (status) {
    case 'DRAFT':
      return 'แบบร่าง';
    case 'CANCELLED':
      return 'ยกเลิก';
    case 'RENEWED':
      return 'ต่อสัญญาแล้ว';
    case 'EXPIRED':
      return 'หมดอายุ';
    default:
      return 'ไม่ใช้งาน';
  }
}
