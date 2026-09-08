import { Injectable, signal } from '@angular/core';
import { Observable, delay, of, throwError } from 'rxjs';
import {
  DocumentCategory,
  DocumentVersion,
  ProjectDocument,
} from '../models/document.model';

const DOCS_KEY = 'cpams_mock_documents';
const VERSIONS_KEY = 'cpams_mock_document_versions';

/** สร้างหน้า HTML ตัวอย่างให้เปิดดูได้เมื่อยังไม่มีไฟล์จริง */
export function buildMockFilePreview(
  fileName: string,
  version: string,
  note = ''
): string {
  const html = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(fileName)}</title>
  <style>
    body { font-family: Sarabun, Segoe UI, sans-serif; margin: 0; padding: 2rem; background: #f4f1ea; color: #1c2b28; }
    .card { max-width: 720px; margin: 0 auto; background: #fff; border-radius: 16px; padding: 1.5rem 1.75rem; border: 1px solid #d8e5e1; box-shadow: 0 8px 24px rgba(28,43,40,.06); }
    h1 { margin: 0 0 .35rem; font-size: 1.35rem; }
    .meta { color: #0f766e; font-weight: 600; margin: 0 0 1rem; }
    .note { color: #5b6762; line-height: 1.5; }
    hr { border: 0; border-top: 1px solid #e4eeeb; margin: 1.25rem 0; }
    .hint { font-size: .9rem; color: #5b6762; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(fileName)}</h1>
    <p class="meta">เวอร์ชัน ${escapeHtml(version)} · ไฟล์ตัวอย่าง (mock)</p>
    <p class="note">${escapeHtml(note || 'ไม่มีหมายเหตุ')}</p>
    <hr />
    <p class="hint">ในระบบจริง ไฟล์นี้จะเปิดหรือดาวน์โหลดจากที่เก็บเอกสาร</p>
  </div>
</body>
</html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function withPreview(v: Omit<DocumentVersion, 'fileDataUrl' | 'mimeType'> & Partial<DocumentVersion>): DocumentVersion {
  return {
    ...v,
    fileDataUrl: v.fileDataUrl ?? buildMockFilePreview(v.fileName, v.version, v.note),
    mimeType: v.mimeType ?? 'text/html',
  };
}

const SEED_DOCS: ProjectDocument[] = [
  {
    id: 1,
    projectId: 1,
    customerId: 1,
    title: 'สัญญาจ้างพัฒนาระบบ IoT',
    category: 'CONTRACT',
    currentVersion: 'v1.1',
    updatedAt: '2026-02-10T09:00:00.000Z',
  },
  {
    id: 2,
    projectId: 1,
    customerId: 1,
    title: 'เอกสารส่งมอบแดชบอร์ด',
    category: 'DELIVERY',
    currentVersion: 'v0.9',
    updatedAt: '2026-07-01T10:30:00.000Z',
  },
  {
    id: 3,
    projectId: 2,
    customerId: 2,
    title: 'ข้อกำหนดฟังก์ชันแอปแจ้งซ่อม',
    category: 'SPEC',
    currentVersion: 'v2.0',
    updatedAt: '2026-03-15T08:00:00.000Z',
  },
];

const SEED_VERSIONS: DocumentVersion[] = [
  withPreview({
    id: 1,
    documentId: 1,
    version: 'v1.0',
    fileName: 'contract-iot-v1.pdf',
    sizeKb: 420,
    uploadedByUserId: 2,
    uploadedAt: '2025-11-05T09:00:00.000Z',
    note: 'ร่างแรก',
  }),
  withPreview({
    id: 2,
    documentId: 1,
    version: 'v1.1',
    fileName: 'contract-iot-v1.1.pdf',
    sizeKb: 438,
    uploadedByUserId: 1,
    uploadedAt: '2026-02-10T09:00:00.000Z',
    note: 'แก้เงื่อนไข SLA',
  }),
  withPreview({
    id: 3,
    documentId: 2,
    version: 'v0.9',
    fileName: 'delivery-dashboard-v09.pdf',
    sizeKb: 890,
    uploadedByUserId: 2,
    uploadedAt: '2026-07-01T10:30:00.000Z',
    note: 'รอบทดสอบ',
  }),
  withPreview({
    id: 4,
    documentId: 3,
    version: 'v1.0',
    fileName: 'srs-repair-app-v1.docx',
    sizeKb: 210,
    uploadedByUserId: 4,
    uploadedAt: '2026-02-20T08:00:00.000Z',
    note: '',
  }),
  withPreview({
    id: 5,
    documentId: 3,
    version: 'v2.0',
    fileName: 'srs-repair-app-v2.docx',
    sizeKb: 256,
    uploadedByUserId: 2,
    uploadedAt: '2026-03-15T08:00:00.000Z',
    note: 'เพิ่ม flow อนุมัติงาน',
  }),
];

export interface DocumentCreateInput {
  projectId: number;
  customerId: number;
  title: string;
  category: DocumentCategory;
  fileName: string;
  version: string;
  note: string;
  uploadedByUserId: number;
  sizeKb?: number;
  fileDataUrl?: string | null;
  mimeType?: string | null;
}

export interface DocumentVersionInput {
  version: string;
  fileName: string;
  note: string;
  uploadedByUserId: number;
  sizeKb?: number;
  fileDataUrl?: string | null;
  mimeType?: string | null;
}

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private readonly docsSignal = signal<ProjectDocument[]>(this.load(DOCS_KEY, SEED_DOCS));
  private readonly versionsSignal = signal<DocumentVersion[]>(
    this.loadVersions(VERSIONS_KEY, SEED_VERSIONS)
  );
  private nextDocId = this.maxId(this.docsSignal()) + 1;
  private nextVersionId = this.maxId(this.versionsSignal()) + 1;

  readonly documents = this.docsSignal.asReadonly();

  list(): Observable<ProjectDocument[]> {
    return of(structuredClone(this.docsSignal())).pipe(delay(180));
  }

  getById(id: number): ProjectDocument | undefined {
    return this.docsSignal().find((d) => d.id === id);
  }

  getByProject(projectId: number): ProjectDocument[] {
    return this.docsSignal().filter((d) => d.projectId === projectId);
  }

  getByCustomer(customerId: number): ProjectDocument[] {
    return this.docsSignal().filter((d) => d.customerId === customerId);
  }

  getVersions(documentId: number): DocumentVersion[] {
    return this.versionsSignal()
      .filter((v) => v.documentId === documentId)
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  }

  getLatestVersion(documentId: number): DocumentVersion | undefined {
    return this.getVersions(documentId)[0];
  }

  create(input: DocumentCreateInput): Observable<ProjectDocument> {
    if (!input.title.trim() || !input.projectId || !input.fileName.trim()) {
      return throwError(() => new Error('กรุณาระบุชื่อเอกสาร โครงการ และชื่อไฟล์'));
    }
    const version = (input.version || 'v1.0').trim();
    const fileName = input.fileName.trim();
    const note = input.note.trim();
    const doc: ProjectDocument = {
      id: this.nextDocId++,
      projectId: input.projectId,
      customerId: input.customerId,
      title: input.title.trim(),
      category: input.category,
      currentVersion: version,
      updatedAt: new Date().toISOString(),
    };
    const ver: DocumentVersion = {
      id: this.nextVersionId++,
      documentId: doc.id,
      version,
      fileName,
      sizeKb: input.sizeKb ?? Math.floor(80 + Math.random() * 400),
      uploadedByUserId: input.uploadedByUserId,
      uploadedAt: new Date().toISOString(),
      note,
      fileDataUrl: input.fileDataUrl || buildMockFilePreview(fileName, version, note),
      mimeType: input.mimeType || (input.fileDataUrl ? null : 'text/html'),
    };
    this.docsSignal.update((list) => {
      const next = [doc, ...list];
      this.save(DOCS_KEY, next);
      return next;
    });
    this.versionsSignal.update((list) => {
      const next = [...list, ver];
      this.save(VERSIONS_KEY, next);
      return next;
    });
    return of(structuredClone(doc)).pipe(delay(220));
  }

  addVersion(documentId: number, input: DocumentVersionInput): Observable<DocumentVersion> {
    const doc = this.getById(documentId);
    if (!doc) {
      return throwError(() => new Error('ไม่พบเอกสาร'));
    }
    if (!input.version.trim() || !input.fileName.trim()) {
      return throwError(() => new Error('กรุณาระบุเวอร์ชันและชื่อไฟล์'));
    }
    const version = input.version.trim();
    const fileName = input.fileName.trim();
    const note = input.note.trim();
    const ver: DocumentVersion = {
      id: this.nextVersionId++,
      documentId,
      version,
      fileName,
      sizeKb: input.sizeKb ?? Math.floor(80 + Math.random() * 400),
      uploadedByUserId: input.uploadedByUserId,
      uploadedAt: new Date().toISOString(),
      note,
      fileDataUrl: input.fileDataUrl || buildMockFilePreview(fileName, version, note),
      mimeType: input.mimeType || (input.fileDataUrl ? null : 'text/html'),
    };
    this.versionsSignal.update((list) => {
      const next = [...list, ver];
      this.save(VERSIONS_KEY, next);
      return next;
    });
    this.docsSignal.update((list) => {
      const next = list.map((d) =>
        d.id === documentId
          ? { ...d, currentVersion: ver.version, updatedAt: ver.uploadedAt }
          : d
      );
      this.save(DOCS_KEY, next);
      return next;
    });
    return of(structuredClone(ver)).pipe(delay(200));
  }

  deleteDocument(documentId: number): Observable<void> {
    if (!this.getById(documentId)) {
      return throwError(() => new Error('ไม่พบเอกสาร'));
    }
    this.docsSignal.update((list) => {
      const next = list.filter((d) => d.id !== documentId);
      this.save(DOCS_KEY, next);
      return next;
    });
    this.versionsSignal.update((list) => {
      const next = list.filter((v) => v.documentId !== documentId);
      this.save(VERSIONS_KEY, next);
      return next;
    });
    return of(void 0).pipe(delay(150));
  }

  deleteVersion(documentId: number, versionId: number): Observable<DocumentVersion[]> {
    const remaining = this.getVersions(documentId).filter((v) => v.id !== versionId);
    if (remaining.length === this.getVersions(documentId).length) {
      return throwError(() => new Error('ไม่พบเวอร์ชัน'));
    }
    if (remaining.length === 0) {
      return throwError(() => new Error('ต้องเหลืออย่างน้อย 1 เวอร์ชัน — หรือลบทั้งเอกสารแทน'));
    }
    this.versionsSignal.update((list) => {
      const next = list.filter((v) => v.id !== versionId);
      this.save(VERSIONS_KEY, next);
      return next;
    });
    const latest = remaining[0];
    this.docsSignal.update((list) => {
      const next = list.map((d) =>
        d.id === documentId
          ? { ...d, currentVersion: latest.version, updatedAt: new Date().toISOString() }
          : d
      );
      this.save(DOCS_KEY, next);
      return next;
    });
    return of(structuredClone(remaining)).pipe(delay(150));
  }

  private load<T>(key: string, seed: T[]): T[] {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        return JSON.parse(raw) as T[];
      }
    } catch {
      /* ignore */
    }
    const data = structuredClone(seed);
    this.save(key, data);
    return data;
  }

  private loadVersions(key: string, seed: DocumentVersion[]): DocumentVersion[] {
    const list = this.load(key, seed).map((v) =>
      withPreview({
        ...v,
        fileDataUrl: (v as DocumentVersion).fileDataUrl ?? null,
        mimeType: (v as DocumentVersion).mimeType ?? null,
      })
    );
    this.save(key, list);
    return list;
  }

  private save<T>(key: string, data: T[]): void {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch {
      /* quota — ignore for oversized file data */
    }
  }

  private maxId(items: { id: number }[]): number {
    return items.reduce((max, i) => Math.max(max, i.id), 0);
  }
}
