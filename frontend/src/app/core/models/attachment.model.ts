import { formatDocumentFileSize } from './document.model';

/** refType ของ POST/GET /api/attachments — ตามสัญญา BE */
export type AttachmentRefType =
  | 'COMMUNICATION_LOG'
  | 'DELIVERY'
  | 'TICKET'
  | 'TICKET_RESOLUTION'
  | 'MA_CONTRACT';

/**
 * ไฟล์แนบจาก API กลาง
 * ห้ามโชว์/เก็บ object key · ดาวน์โหลดผ่าน downloadUrl + Authorization เท่านั้น
 */
export interface Attachment {
  id: number;
  refType: AttachmentRefType;
  refId: number;
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
  note: string | null;
  /** เช่น /api/attachments/12/download */
  downloadUrl: string;
  createdAt: string;
}

export interface AttachmentListParams {
  refType: AttachmentRefType;
  refId: number;
}

export interface AttachmentUploadInput {
  file: File;
  refType: AttachmentRefType;
  refId: number;
  note?: string;
}

export interface AttachmentUpdateInput {
  note: string | null;
}

export const ATTACHMENT_ACCEPT =
  '.pdf,.jpg,.jpeg,.png,.webp,.gif,.heic,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.txt,.csv,.zip,.rar,.7z';

export const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;

export const ATTACHMENT_REF_LABELS: Record<AttachmentRefType, string> = {
  COMMUNICATION_LOG: 'หลักฐานการติดต่อ',
  DELIVERY: 'ไฟล์ใบส่งมอบ',
  TICKET: 'ไฟล์แนบใบปัญหา',
  TICKET_RESOLUTION: 'ไฟล์แนบรอบแก้ไข',
  MA_CONTRACT: 'สแกนสัญญาที่เซ็นแล้ว',
};

export function formatAttachmentSize(bytes: number | null | undefined): string {
  if (bytes == null) {
    return '—';
  }
  return formatDocumentFileSize(bytes);
}
