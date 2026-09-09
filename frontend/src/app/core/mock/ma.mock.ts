import { MaAddon, MaContract, MaPlan } from '../models/ma.model';

/**
 * ข้อมูลตัวอย่างออฟไลน์ — ไม่ใช้เมื่อต่อ API แล้ว
 * คงไว้เฉพาะอ้างอิงโครงสร้างตอนพัฒนา
 */
export const MOCK_MA_PLANS: MaPlan[] = [
  {
    id: 1,
    code: 'MA_BASIC',
    name: 'แผนมาตรฐาน',
    description: 'ดูแลระบบพื้นฐาน โควตาเคสซ่อมรายเดือน + SLA มาตรฐาน',
    bugQuotaPerMonth: 4,
    responseTimeHour: 24,
    onsiteQuotaPerMonth: 0,
    isActive: true,
    sortOrder: 10,
    items: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 2,
    code: 'MA_GOLD',
    name: 'แผน Gold',
    description: 'โควตาสูงขึ้น ตอบรับเร็วขึ้น',
    bugQuotaPerMonth: 8,
    responseTimeHour: 8,
    onsiteQuotaPerMonth: 1,
    isActive: true,
    sortOrder: 20,
    items: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

export interface MaMockSeedContext {
  customerId: number;
  projectId: number;
  secondProjectId?: number | null;
}

/** @deprecated mock seed — Phase 8 ใช้ API แล้ว */
export function buildMockMaContracts(ctx: MaMockSeedContext): {
  contracts: MaContract[];
  addons: MaAddon[];
} {
  const now = new Date().toISOString();
  const year = new Date().getFullYear();
  const start = `${year}-01-15`;
  const end = `${year}-12-14`;

  const contracts: MaContract[] = [
    {
      id: 1,
      customerId: ctx.customerId,
      customerName: null,
      projectId: ctx.projectId,
      projectName: null,
      planId: 2,
      plan: {
        id: 2,
        code: 'MA_GOLD',
        name: 'แผน Gold',
        bugQuotaPerMonth: 8,
        responseTimeHour: 8,
      },
      contractNo: `MA-${year}-001`,
      price: '96000.00',
      billingCycle: 'YEARLY',
      startDate: start,
      endDate: end,
      status: 'ACTIVE',
      isCurrentlyActive: true,
      daysUntilExpiry: 90,
      signedDate: null,
      signedFileUrl: null,
      previousContractId: null,
      note: 'ตัวอย่าง',
      quota: {
        contractId: 1,
        periodYear: year,
        periodMonth: 1,
        periodStart: start,
        periodEnd: `${year}-02-14`,
        quota: 8,
        used: 3,
        remaining: 5,
        isExhausted: false,
      },
      createdAt: now,
      updatedAt: now,
    },
  ];

  if (ctx.secondProjectId) {
    contracts.push({
      ...contracts[0],
      id: 2,
      projectId: ctx.secondProjectId,
      planId: 1,
      plan: {
        id: 1,
        code: 'MA_BASIC',
        name: 'แผนมาตรฐาน',
        bugQuotaPerMonth: 4,
        responseTimeHour: 24,
      },
      contractNo: `MA-${year}-002`,
      price: '42000.00',
      quota: {
        contractId: 2,
        periodYear: year,
        periodMonth: 1,
        periodStart: start,
        periodEnd: `${year}-02-14`,
        quota: 4,
        used: 3,
        remaining: 1,
        isExhausted: false,
      },
    });
  }

  const addons: MaAddon[] = [
    {
      id: 1,
      contractId: 1,
      addonType: 'EXTRA_QUOTA',
      title: 'แพ็กโควตาเพิ่ม +3 เคส',
      extraQuota: 3,
      price: '4500.00',
      effectiveYear: null,
      effectiveMonth: null,
      note: null,
      createdAt: `${year}-03-15T00:00:00.000Z`,
    },
  ];

  return { contracts, addons };
}
