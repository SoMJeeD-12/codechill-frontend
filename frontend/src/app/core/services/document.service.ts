import { Injectable, signal } from '@angular/core';
import { Observable, delay, of, throwError } from 'rxjs';
import {
  DocumentCategory,
  DocumentVersion,
  ProjectDocument,
} from '../models/document.model';

const DOCS_KEY = 'cpams_mock_documents';
const VERSIONS_KEY = 'cpams_mock_document_versions';

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
  {
    id: 1,
    documentId: 1,
    version: 'v1.0',
    fileName: 'contract-iot-v1.pdf',
    sizeKb: 420,
    uploadedByUserId: 2,
    uploadedAt: '2025-11-05T09:00:00.000Z',
    note: 'ร่างแรก',
  },
  {
    id: 2,
    documentId: 1,
    version: 'v1.1',
    fileName: 'contract-iot-v1.1.pdf',
    sizeKb: 438,
    uploadedByUserId: 1,
    uploadedAt: '2026-02-10T09:00:00.000Z',
    note: 'แก้เงื่อนไข SLA',
  },
  {
    id: 3,
    documentId: 2,
    version: 'v0.9',
    fileName: 'delivery-dashboard-v09.pdf',
    sizeKb: 890,
    uploadedByUserId: 2,
    uploadedAt: '2026-07-01T10:30:00.000Z',
    note: 'รอบทดสอบ',
  },
  {
    id: 4,
    documentId: 3,
    version: 'v1.0',
    fileName: 'srs-repair-app-v1.docx',
    sizeKb: 210,
    uploadedByUserId: 4,
    uploadedAt: '2026-02-20T08:00:00.000Z',
    note: '',
  },
  {
    id: 5,
    documentId: 3,
    version: 'v2.0',
    fileName: 'srs-repair-app-v2.docx',
    sizeKb: 256,
    uploadedByUserId: 2,
    uploadedAt: '2026-03-15T08:00:00.000Z',
    note: 'เพิ่ม flow อนุมัติงาน',
  },
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
}

export interface DocumentVersionInput {
  version: string;
  fileName: string;
  note: string;
  uploadedByUserId: number;
  sizeKb?: number;
}

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private readonly docsSignal = signal<ProjectDocument[]>(this.load(DOCS_KEY, SEED_DOCS));
  private readonly versionsSignal = signal<DocumentVersion[]>(
    this.load(VERSIONS_KEY, SEED_VERSIONS)
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

  create(input: DocumentCreateInput): Observable<ProjectDocument> {
    if (!input.title.trim() || !input.projectId || !input.fileName.trim()) {
      return throwError(() => new Error('กรุณาระบุชื่อเอกสาร โครงการ และชื่อไฟล์'));
    }
    const version = (input.version || 'v1.0').trim();
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
      fileName: input.fileName.trim(),
      sizeKb: input.sizeKb ?? Math.floor(80 + Math.random() * 400),
      uploadedByUserId: input.uploadedByUserId,
      uploadedAt: new Date().toISOString(),
      note: input.note.trim(),
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
    const ver: DocumentVersion = {
      id: this.nextVersionId++,
      documentId,
      version: input.version.trim(),
      fileName: input.fileName.trim(),
      sizeKb: input.sizeKb ?? Math.floor(80 + Math.random() * 400),
      uploadedByUserId: input.uploadedByUserId,
      uploadedAt: new Date().toISOString(),
      note: input.note.trim(),
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

  private save<T>(key: string, data: T[]): void {
    localStorage.setItem(key, JSON.stringify(data));
  }

  private maxId(items: { id: number }[]): number {
    return items.reduce((max, i) => Math.max(max, i.id), 0);
  }
}
