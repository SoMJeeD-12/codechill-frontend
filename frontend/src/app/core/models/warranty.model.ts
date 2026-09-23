import {
  addDays,
  contractEndFromDuration,
  formatThaiDate,
  parseDateOnly,
} from '../utils/date.util';

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
  /** อ้างอิงสัญญา MA ของโปรเจกต์เดียวกัน — ไม่บังคับ · ไม่คิดรวมโควตา */
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

/**
 * วันเริ่มประกันตามพี่เลี้ยง = วันถัดจากวันส่งมอบ
 * (ส่งวันนี้ เวลาไหนก็ได้ → นับพรุ่งนี้เป็นวันที่ 1)
 * ใช้โชว์ preview บน FE — หลังบันทึกยึดค่าจาก API ถ้ามี
 */
export function warrantyStartAfterDelivery(
  deliveryDate: string | Date | null | undefined
): Date | null {
  const base = parseDateOnly(deliveryDate);
  if (!base) {
    return null;
  }
  return addDays(base, 1);
}

/** ช่วงประกันโดยประมาณจากวันส่งมอบ + ระยะเดือน (preview / mock บนฟอร์ม) */
export function warrantyPeriodPreview(
  deliveryDate: string | Date | null | undefined,
  durationMonth: number
): { startLabel: string; endLabel: string } | null {
  const start = warrantyStartAfterDelivery(deliveryDate);
  if (!start || !durationMonth || durationMonth < 1) {
    return null;
  }
  const end = contractEndFromDuration(start, durationMonth);
  return {
    startLabel: formatThaiDate(start),
    endLabel: formatThaiDate(end),
  };
}

/** session mock — ยืนยันประกันที่มีอยู่แล้วหลังส่งมอบ (ยังไม่มี API) */
export const WARRANTY_CONFIRM_MOCK_KEY = 'cpams_warranty_confirm_mock_v1';

export interface WarrantyConfirmMock {
  projectId: number;
  warrantyId: number;
  confirmedAt: string;
}

export function readWarrantyConfirmMock(projectId: number): WarrantyConfirmMock | null {
  try {
    const raw = sessionStorage.getItem(WARRANTY_CONFIRM_MOCK_KEY);
    if (!raw) {
      return null;
    }
    const map = JSON.parse(raw) as Record<string, WarrantyConfirmMock>;
    return map[String(projectId)] ?? null;
  } catch {
    return null;
  }
}

export function writeWarrantyConfirmMock(entry: WarrantyConfirmMock): void {
  try {
    const raw = sessionStorage.getItem(WARRANTY_CONFIRM_MOCK_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, WarrantyConfirmMock>) : {};
    map[String(entry.projectId)] = entry;
    sessionStorage.setItem(WARRANTY_CONFIRM_MOCK_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}
