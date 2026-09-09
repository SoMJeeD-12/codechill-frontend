export type DocumentCategory = 'CONTRACT' | 'SPEC' | 'DELIVERY' | 'MANUAL' | 'OTHER';

/**
 * เอกสารโครงการ (เมตาดาต้า + เวอร์ชันปัจจุบัน)
 * เส้นทางที่คาดไว้: /api/documents หรือผูกใต้ projects
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
