import { Injectable, inject, signal } from '@angular/core';
import { Observable, delay, of, throwError } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { buildMockDocuments } from '../mock/file.mock';
import {
  DocumentCategory,
  DocumentVersion,
  ProjectDocument,
} from '../models/document.model';
import { buildFilePreview } from '../utils/file-preview.util';
import { FileService } from './file.service';

export { buildFilePreview } from '../utils/file-preview.util';

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

export interface DocumentListParams {
  projectId?: number;
  customerId?: number;
  category?: DocumentCategory;
  search?: string;
}

/**
 * เอกสารโครงการ (M9) — mock จนกว่า Phase 9 /api/files พร้อม
 * อัปโหลดจริงจะวิ่งผ่าน FileService → POST /api/files แล้วผูก fileId
 */
@Injectable({ providedIn: 'root' })
export class DocumentService {
  private readonly filesApi = inject(FileService);
  private readonly docsSignal = signal<ProjectDocument[]>([]);
  private readonly versionsSignal = signal<DocumentVersion[]>([]);
  private nextDocId = 1;
  private nextVersionId = 1;
  private demoSeeded = false;

  readonly documents = this.docsSignal.asReadonly();

  list(params: DocumentListParams = {}): Observable<ProjectDocument[]> {
    let rows = this.docsSignal();
    if (params.projectId != null) {
      rows = rows.filter((d) => d.projectId === params.projectId);
    }
    if (params.customerId != null) {
      rows = rows.filter((d) => d.customerId === params.customerId);
    }
    if (params.category) {
      rows = rows.filter((d) => d.category === params.category);
    }
    if (params.search?.trim()) {
      const q = params.search.trim().toLowerCase();
      rows = rows.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.currentVersion.toLowerCase().includes(q) ||
          (d.note ?? '').toLowerCase().includes(q)
      );
    }
    return of(structuredClone(rows)).pipe(delay(180));
  }

  getById(id: number): ProjectDocument | undefined {
    return this.docsSignal().find((d) => d.id === id);
  }

  get(id: number): Observable<ProjectDocument> {
    const row = this.getById(id);
    if (!row) {
      return throwError(() => new Error('ไม่พบเอกสาร'));
    }
    return of(structuredClone(row)).pipe(delay(100));
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

  listVersions(documentId: number): Observable<DocumentVersion[]> {
    return of(structuredClone(this.getVersions(documentId))).pipe(delay(100));
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
    const sizeKb = input.sizeKb ?? Math.floor(80 + Math.random() * 400);
    const dataUrl = input.fileDataUrl || buildFilePreview(fileName, version, note);

    return this.filesApi
      .upload({
        originalName: fileName,
        mimeType: input.mimeType || (input.fileDataUrl ? null : 'text/html'),
        sizeBytes: sizeKb * 1024,
        uploadedByUserId: input.uploadedByUserId,
        dataUrl,
        entityType: 'DOCUMENT_VERSION',
      })
      .pipe(
        switchMap((file) => {
          const now = new Date().toISOString();
          const doc: ProjectDocument = {
            id: this.nextDocId++,
            projectId: input.projectId,
            customerId: input.customerId,
            title: input.title.trim(),
            category: input.category,
            currentVersion: version,
            currentFileId: file.id,
            note: note || null,
            createdAt: now,
            updatedAt: now,
          };
          const ver: DocumentVersion = {
            id: this.nextVersionId++,
            documentId: doc.id,
            version,
            fileId: file.id,
            fileName,
            sizeKb,
            uploadedByUserId: input.uploadedByUserId,
            uploadedAt: now,
            note: note || null,
            fileDataUrl: file.url,
            mimeType: file.mimeType,
          };
          this.filesApi.upsertLocal({
            ...file,
            entityId: ver.id,
          });
          this.docsSignal.update((list) => [doc, ...list]);
          this.versionsSignal.update((list) => [...list, ver]);
          return of(structuredClone(doc)).pipe(delay(40));
        })
      );
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
    const sizeKb = input.sizeKb ?? Math.floor(80 + Math.random() * 400);
    const dataUrl = input.fileDataUrl || buildFilePreview(fileName, version, note);

    return this.filesApi
      .upload({
        originalName: fileName,
        mimeType: input.mimeType || (input.fileDataUrl ? null : 'text/html'),
        sizeBytes: sizeKb * 1024,
        uploadedByUserId: input.uploadedByUserId,
        dataUrl,
        entityType: 'DOCUMENT_VERSION',
      })
      .pipe(
        switchMap((file) => {
          const ver: DocumentVersion = {
            id: this.nextVersionId++,
            documentId,
            version,
            fileId: file.id,
            fileName,
            sizeKb,
            uploadedByUserId: input.uploadedByUserId,
            uploadedAt: new Date().toISOString(),
            note: note || null,
            fileDataUrl: file.url,
            mimeType: file.mimeType,
          };
          this.filesApi.upsertLocal({ ...file, entityId: ver.id });
          this.versionsSignal.update((list) => [...list, ver]);
          this.docsSignal.update((list) =>
            list.map((d) =>
              d.id === documentId
                ? {
                    ...d,
                    currentVersion: ver.version,
                    currentFileId: file.id,
                    updatedAt: ver.uploadedAt,
                  }
                : d
            )
          );
          return of(structuredClone(ver)).pipe(delay(40));
        })
      );
  }

  deleteDocument(documentId: number): Observable<void> {
    if (!this.getById(documentId)) {
      return throwError(() => new Error('ไม่พบเอกสาร'));
    }
    const fileIds = this.getVersions(documentId)
      .map((v) => v.fileId)
      .filter((id): id is number => id != null);
    this.docsSignal.update((list) => list.filter((d) => d.id !== documentId));
    this.versionsSignal.update((list) => list.filter((v) => v.documentId !== documentId));
    for (const fileId of fileIds) {
      this.filesApi.remove(fileId).subscribe({ error: () => undefined });
    }
    return of(void 0).pipe(delay(150));
  }

  deleteVersion(documentId: number, versionId: number): Observable<DocumentVersion[]> {
    const before = this.getVersions(documentId);
    const target = before.find((v) => v.id === versionId);
    const remaining = before.filter((v) => v.id !== versionId);
    if (!target) {
      return throwError(() => new Error('ไม่พบเวอร์ชัน'));
    }
    if (remaining.length === 0) {
      return throwError(() => new Error('ต้องเหลืออย่างน้อย 1 เวอร์ชัน — หรือลบทั้งเอกสารแทน'));
    }
    this.versionsSignal.update((list) => list.filter((v) => v.id !== versionId));
    if (target.fileId != null) {
      this.filesApi.remove(target.fileId).subscribe({ error: () => undefined });
    }
    const latest = remaining[0];
    this.docsSignal.update((list) =>
      list.map((d) =>
        d.id === documentId
          ? {
              ...d,
              currentVersion: latest.version,
              currentFileId: latest.fileId,
              updatedAt: new Date().toISOString(),
            }
          : d
      )
    );
    return of(structuredClone(remaining)).pipe(delay(150));
  }

  /**
   * เติมเอกสารตัวอย่างครั้งเดียวเมื่อมีโครงการจาก API
   * ไม่ทับเอกสารที่ผู้ใช้อัปโหลดเอง
   */
  ensureDemoSeed(
    customerId: number,
    projectId: number,
    uploadedByUserId: number
  ): Observable<ProjectDocument[]> {
    if (this.demoSeeded || this.docsSignal().length > 0) {
      return this.list();
    }
    const { files, documents, versions } = buildMockDocuments({
      customerId,
      projectId,
      uploadedByUserId,
    });
    this.filesApi.replaceAll(files);
    this.docsSignal.set(documents);
    this.versionsSignal.set(versions);
    this.nextDocId = Math.max(...documents.map((d) => d.id)) + 1;
    this.nextVersionId = Math.max(...versions.map((v) => v.id)) + 1;
    this.demoSeeded = true;
    return of(structuredClone(documents)).pipe(delay(160));
  }
}
