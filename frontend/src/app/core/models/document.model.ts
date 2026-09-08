export type DocumentCategory = 'CONTRACT' | 'SPEC' | 'DELIVERY' | 'MANUAL' | 'OTHER';

export interface ProjectDocument {
  id: number;
  projectId: number;
  customerId: number;
  title: string;
  category: DocumentCategory;
  currentVersion: string;
  updatedAt: string;
}

export interface DocumentVersion {
  id: number;
  documentId: number;
  version: string;
  fileName: string;
  sizeKb: number;
  uploadedByUserId: number;
  uploadedAt: string;
  note: string;
  /** mock: data URL ของไฟล์ที่เลือกอัปโหลด หรือหน้า preview */
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
