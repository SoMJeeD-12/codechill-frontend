import { DocumentVersion, ProjectDocument } from '../models/document.model';
import { StoredFile } from '../models/file.model';
import { buildFilePreview } from '../utils/file-preview.util';

export interface FileMockSeedContext {
  customerId: number;
  projectId: number;
  uploadedByUserId: number;
}

/** สร้างไฟล์ + เอกสารตัวอย่างสำหรับ Phase 9 mock */
export function buildMockDocuments(ctx: FileMockSeedContext): {
  files: StoredFile[];
  documents: ProjectDocument[];
  versions: DocumentVersion[];
} {
  const now = new Date().toISOString();
  const year = new Date().getFullYear();
  const userId = ctx.uploadedByUserId;

  const specV1Name = 'WMS-Requirement-v1.0.pdf';
  const specV2Name = 'WMS-Requirement-v1.1.pdf';
  const contractName = `MA-Contract-${year}.pdf`;
  const deliveryName = 'Delivery-Acceptance-DN-01.pdf';
  const manualName = 'User-Manual-TH.pdf';

  const files: StoredFile[] = [
    {
      id: 1,
      originalName: specV1Name,
      mimeType: 'application/pdf',
      sizeBytes: 420_000,
      storageKey: `mock/projects/${ctx.projectId}/docs/1/${specV1Name}`,
      uploadedByUserId: userId,
      uploadedAt: `${year}-02-10T04:00:00.000Z`,
      url: buildFilePreview(specV1Name, 'v1.0', 'สเปกเริ่มต้น'),
      entityType: 'DOCUMENT_VERSION',
      entityId: 1,
    },
    {
      id: 2,
      originalName: specV2Name,
      mimeType: 'application/pdf',
      sizeBytes: 455_000,
      storageKey: `mock/projects/${ctx.projectId}/docs/1/${specV2Name}`,
      uploadedByUserId: userId,
      uploadedAt: `${year}-04-02T08:30:00.000Z`,
      url: buildFilePreview(specV2Name, 'v1.1', 'อัปเดตขอบเขตคลัง'),
      entityType: 'DOCUMENT_VERSION',
      entityId: 2,
    },
    {
      id: 3,
      originalName: contractName,
      mimeType: 'application/pdf',
      sizeBytes: 310_000,
      storageKey: `mock/projects/${ctx.projectId}/docs/2/${contractName}`,
      uploadedByUserId: userId,
      uploadedAt: `${year}-01-15T03:00:00.000Z`,
      url: buildFilePreview(contractName, 'v1.0', 'สัญญาบริการ'),
      entityType: 'DOCUMENT_VERSION',
      entityId: 3,
    },
    {
      id: 4,
      originalName: deliveryName,
      mimeType: 'application/pdf',
      sizeBytes: 180_000,
      storageKey: `mock/projects/${ctx.projectId}/docs/3/${deliveryName}`,
      uploadedByUserId: userId,
      uploadedAt: `${year}-06-20T10:00:00.000Z`,
      url: buildFilePreview(deliveryName, 'v1.0', 'ใบตรวจรับส่งมอบ'),
      entityType: 'DOCUMENT_VERSION',
      entityId: 4,
    },
    {
      id: 5,
      originalName: manualName,
      mimeType: 'application/pdf',
      sizeBytes: 890_000,
      storageKey: `mock/projects/${ctx.projectId}/docs/4/${manualName}`,
      uploadedByUserId: userId,
      uploadedAt: `${year}-07-01T02:15:00.000Z`,
      url: buildFilePreview(manualName, 'v1.0', 'คู่มือผู้ใช้ภาษาไทย'),
      entityType: 'DOCUMENT_VERSION',
      entityId: 5,
    },
  ];

  const documents: ProjectDocument[] = [
    {
      id: 1,
      projectId: ctx.projectId,
      customerId: ctx.customerId,
      title: 'เอกสารความต้องการระบบคลัง',
      category: 'SPEC',
      currentVersion: 'v1.1',
      currentFileId: 2,
      note: 'มี 2 เวอร์ชัน — ใช้ทดสอบประวัติไฟล์',
      createdAt: `${year}-02-10T04:00:00.000Z`,
      updatedAt: `${year}-04-02T08:30:00.000Z`,
    },
    {
      id: 2,
      projectId: ctx.projectId,
      customerId: ctx.customerId,
      title: 'สัญญาบริการ / MA',
      category: 'CONTRACT',
      currentVersion: 'v1.0',
      currentFileId: 3,
      note: null,
      createdAt: `${year}-01-15T03:00:00.000Z`,
      updatedAt: `${year}-01-15T03:00:00.000Z`,
    },
    {
      id: 3,
      projectId: ctx.projectId,
      customerId: ctx.customerId,
      title: 'เอกสารส่งมอบรอบที่ 1',
      category: 'DELIVERY',
      currentVersion: 'v1.0',
      currentFileId: 4,
      note: 'แนบหลักฐานตรวจรับ (mock)',
      createdAt: `${year}-06-20T10:00:00.000Z`,
      updatedAt: `${year}-06-20T10:00:00.000Z`,
    },
    {
      id: 4,
      projectId: ctx.projectId,
      customerId: ctx.customerId,
      title: 'คู่มือผู้ใช้งาน',
      category: 'MANUAL',
      currentVersion: 'v1.0',
      currentFileId: 5,
      note: null,
      createdAt: `${year}-07-01T02:15:00.000Z`,
      updatedAt: `${year}-07-01T02:15:00.000Z`,
    },
  ];

  const versions: DocumentVersion[] = [
    {
      id: 1,
      documentId: 1,
      version: 'v1.0',
      fileId: 1,
      fileName: specV1Name,
      sizeKb: 410,
      uploadedByUserId: userId,
      uploadedAt: files[0].uploadedAt,
      note: 'สเปกเริ่มต้น',
      fileDataUrl: files[0].url,
      mimeType: files[0].mimeType,
    },
    {
      id: 2,
      documentId: 1,
      version: 'v1.1',
      fileId: 2,
      fileName: specV2Name,
      sizeKb: 444,
      uploadedByUserId: userId,
      uploadedAt: files[1].uploadedAt,
      note: 'อัปเดตขอบเขตคลัง',
      fileDataUrl: files[1].url,
      mimeType: files[1].mimeType,
    },
    {
      id: 3,
      documentId: 2,
      version: 'v1.0',
      fileId: 3,
      fileName: contractName,
      sizeKb: 303,
      uploadedByUserId: userId,
      uploadedAt: files[2].uploadedAt,
      note: null,
      fileDataUrl: files[2].url,
      mimeType: files[2].mimeType,
    },
    {
      id: 4,
      documentId: 3,
      version: 'v1.0',
      fileId: 4,
      fileName: deliveryName,
      sizeKb: 176,
      uploadedByUserId: userId,
      uploadedAt: files[3].uploadedAt,
      note: 'ใบตรวจรับส่งมอบ',
      fileDataUrl: files[3].url,
      mimeType: files[3].mimeType,
    },
    {
      id: 5,
      documentId: 4,
      version: 'v1.0',
      fileId: 5,
      fileName: manualName,
      sizeKb: 869,
      uploadedByUserId: userId,
      uploadedAt: files[4].uploadedAt,
      note: null,
      fileDataUrl: files[4].url,
      mimeType: files[4].mimeType,
    },
  ];

  return { files, documents, versions };
}
