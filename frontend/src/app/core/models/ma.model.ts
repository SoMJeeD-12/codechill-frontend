export type MaContractStatus = 'ACTIVE' | 'EXPIRED' | 'CANCELLED';

export interface MaContract {
  id: number;
  contractNo: string;
  customerId: number;
  projectId: number | null;
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
  note: string;
}

export interface MaAddon {
  id: number;
  contractId: number;
  name: string;
  quantity: number;
  usedQuantity: number;
  unitPrice: number;
  purchasedAt: string;
}

export const MA_STATUS_LABELS: Record<MaContractStatus, string> = {
  ACTIVE: 'ใช้งานอยู่',
  EXPIRED: 'หมดอายุ',
  CANCELLED: 'ยกเลิก',
};
