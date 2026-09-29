export type DocumentCategory = 'CONTRACT' | 'SPEC' | 'DELIVERY' | 'MANUAL' | 'OTHER';

/**
 * เอกสารโครงการจาก API จริง (M9 / B3)
 * GET /api/projects/:projectId/documents
 */
export interface ApiProjectDocument {
  id: number;
  projectId?: number;
  title: string;
  fileName: string;
  /** ขนาดไฟล์เป็นไบต์ */
  fileSize: number;
  mimeType?: string | null;
  /** เช่น /api/documents/12/download — ต้องดึงผ่าน HttpClient + Authorization */
  downloadUrl: string;
  note: string | null;
  uploadedBy: { id?: number; fullName: string } | null;
  /** GET /documents (รายการรวม) พ่วงโปรเจกต์มาให้ */
  project?: { id: number; code: string | null; name: string; customerName: string | null } | null;
  createdAt: string;
  updatedAt?: string;
}

/**
 * เอกสารโครงการแบบ mock เก่า (เมตาดาต้า + เวอร์ชันปัจจุบัน)
 * ใช้กับ documents-page จนกว่าจะย้ายไป API จริง
 */
export interface ProjectDocument {
  id: number;
  projectId: number;
  customerId: number;
  title: string;
  category: DocumentCategory;
  currentVersion: string;
  currentFileId: number | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * เวอร์ชันเอกสาร — ชี้ไปที่ StoredFile (Phase 9)
 * เก็บ fileDataUrl ไว้เฉพาะ mock เพื่อเปิดดูในเบราว์เซอร์
 */
export interface DocumentVersion {
  id: number;
  documentId: number;
  version: string;
  fileId: number | null;
  fileName: string;
  sizeKb: number;
  uploadedByUserId: number | null;
  uploadedAt: string;
  note: string | null;
  /** mock only — รอ signed URL จาก /api/files */
  fileDataUrl: string | null;
  mimeType: string | null;
}

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  CONTRACT: 'สัญญา',
  SPEC: 'สเปก / ข้อกำหนด',
  DELIVERY: 'เอกสารส่งมอบ',
  MANUAL: 'คู่มือ',
  OTHER: 'อื่นๆ',
};

/** นามสกุลที่ backend รับ (ใส่ใน accept ของ input ด้วย) */
export const DOCUMENT_ACCEPT =
  '.pdf,.jpg,.jpeg,.png,.webp,.gif,.heic,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.txt,.csv,.zip,.rar,.7z';

export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

/** แปลง fileSize (bytes) เป็น KB/MB อ่านง่าย */
export function formatDocumentFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '—';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  }
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}
