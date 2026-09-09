/**
 * ไฟล์ที่เก็บในระบบ (Phase 9 → Cloudflare R2)
 * เส้นทางที่คาดไว้: POST/GET/DELETE /api/files
 */
export type FileEntityType =
  | 'DOCUMENT_VERSION'
  | 'TICKET'
  | 'TICKET_RESOLUTION'
  | 'DELIVERY'
  | 'CUSTOMER'
  | 'OTHER';

export interface StoredFile {
  id: number;
  /** ชื่อไฟล์ต้นฉบับ */
  originalName: string;
  mimeType: string | null;
  sizeBytes: number;
  /** key บน object storage — mock ใช้ path จำลอง */
  storageKey: string;
  uploadedByUserId: number | null;
  uploadedAt: string;
  /**
   * URL เปิดดู — Phase 9 จะเป็น signed URL
   * mock ใช้ data URL / blob placeholder
   */
  url: string | null;
  /** ผูกกับเรคอร์ดใด (optional จนกว่า backend จะยืนยัน schema) */
  entityType: FileEntityType | null;
  entityId: number | null;
}

export interface FileUploadInput {
  originalName: string;
  mimeType?: string | null;
  sizeBytes?: number;
  uploadedByUserId?: number | null;
  /** เนื้อหา mock — จริงจะส่ง multipart */
  dataUrl?: string | null;
  entityType?: FileEntityType | null;
  entityId?: number | null;
}

export interface FileListParams {
  entityType?: FileEntityType;
  entityId?: number;
  search?: string;
  page?: number;
  limit?: number;
}
