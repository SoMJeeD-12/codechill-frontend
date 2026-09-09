import { MaAddon, MaContract, MaPlan } from '../models/ma.model';

/** mock แม่แบบแผน — ใช้จนกว่า Phase 8 จะปล่อย /api/ma-plans */
export const MOCK_MA_PLANS: MaPlan[] = [
  {
    id: 1,
    code: 'MA-BASIC',
    name: 'แผนมาตรฐาน',
    description: 'ดูแลระบบพื้นฐาน โควตาเคสซ่อมรายปี + SLA มาตรฐาน',
    defaultAnnualFee: 48000,
    defaultQuotaTotal: 12,
    defaultSlaHours: 24,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 2,
    code: 'MA-GOLD',
    name: 'แผน Gold',
    description: 'โควตาสูงขึ้น ตอบรับเร็วขึ้น เหมาะกับระบบสำคัญ',
    defaultAnnualFee: 96000,
    defaultQuotaTotal: 24,
    defaultSlaHours: 8,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 3,
    code: 'MA-PLATINUM',
    name: 'แผน Platinum',
    description: 'ครอบคลุมสูงสุด พร้อมโควตาสำรองและ SLA เร่งด่วน',
    defaultAnnualFee: 180000,
    defaultQuotaTotal: 48,
    defaultSlaHours: 4,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

export interface MaMockSeedContext {
  customerId: number;
  projectId: number | null;
  secondProjectId?: number | null;
}

/** สร้างสัญญา + add-on ตัวอย่างผูกกับลูกค้า/โครงการจริงจาก API */
export function buildMockMaContracts(ctx: MaMockSeedContext): {
  contracts: MaContract[];
  addons: MaAddon[];
} {
  const now = new Date().toISOString();
  const year = new Date().getFullYear();
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  const contracts: MaContract[] = [
    {
      id: 1,
      contractNo: `MA-${year}-001`,
      customerId: ctx.customerId,
      projectId: ctx.projectId,
      planId: 2,
      planName: 'แผน Gold',
      startDate: start,
      endDate: end,
      status: 'ACTIVE',
      annualFee: 96000,
      quotaTotal: 24,
      quotaUsed: 5,
      slaHours: 8,
      note: 'สัญญาตัวอย่าง mock — รอ Phase 8 เชื่อม API',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 2,
      contractNo: `MA-${year}-002`,
      customerId: ctx.customerId,
      projectId: ctx.secondProjectId ?? null,
      planId: 1,
      planName: 'แผนมาตรฐาน',
      startDate: start,
      endDate: end,
      status: 'ACTIVE',
      /** แผนเดียวกันแต่ราคาต่างต่อโครงการ ตามเอกสารออกแบบ */
      annualFee: 42000,
      quotaTotal: 12,
      quotaUsed: 10,
      slaHours: 24,
      note: 'ใกล้หมดโควตา — ใช้ทดสอบการแจ้งเตือน/รายงาน',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 3,
      contractNo: `MA-${year - 1}-014`,
      customerId: ctx.customerId,
      projectId: null,
      planId: 1,
      planName: 'แผนมาตรฐาน',
      startDate: `${year - 1}-01-01`,
      endDate: `${year - 1}-12-31`,
      status: 'EXPIRED',
      annualFee: 36000,
      quotaTotal: 12,
      quotaUsed: 12,
      slaHours: 24,
      note: null,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const addons: MaAddon[] = [
    {
      id: 1,
      contractId: 1,
      name: 'แพ็กโควตาเพิ่ม +6 เคส',
      quantity: 6,
      usedQuantity: 1,
      unitPrice: 9000,
      purchasedAt: `${year}-03-15T00:00:00.000Z`,
    },
    {
      id: 2,
      contractId: 1,
      name: 'On-site visit ครึ่งวัน',
      quantity: 2,
      usedQuantity: 0,
      unitPrice: 4500,
      purchasedAt: `${year}-06-01T00:00:00.000Z`,
    },
  ];

  return { contracts, addons };
}
