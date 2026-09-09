import { Injectable, signal } from '@angular/core';
import { Observable, delay, of, throwError } from 'rxjs';
import {
  FileListParams,
  FileUploadInput,
  StoredFile,
} from '../models/file.model';
import { buildFilePreview } from '../utils/file-preview.util';

/**
 * Files Phase 9 — ตอนนี้ mock ในหน่วยความจำ
 * เมื่อ backend พร้อม: สลับเป็น multipart → POST /api/files + signed URL
 */
@Injectable({ providedIn: 'root' })
export class FileService {
  private readonly filesSignal = signal<StoredFile[]>([]);
  private nextId = 1;

  readonly files = this.filesSignal.asReadonly();

  /** GET /api/files */
  list(params: FileListParams = {}): Observable<StoredFile[]> {
    let rows = this.filesSignal();
    if (params.entityType) {
      rows = rows.filter((f) => f.entityType === params.entityType);
    }
    if (params.entityId != null) {
      rows = rows.filter((f) => f.entityId === params.entityId);
    }
    if (params.search?.trim()) {
      const q = params.search.trim().toLowerCase();
      rows = rows.filter((f) => f.originalName.toLowerCase().includes(q));
    }
    return of(structuredClone(rows)).pipe(delay(100));
  }

  getById(id: number): StoredFile | undefined {
    return this.filesSignal().find((f) => f.id === id);
  }

  /** GET /api/files/:id */
  get(id: number): Observable<StoredFile> {
    const row = this.getById(id);
    if (!row) {
      return throwError(() => new Error('ไม่พบไฟล์'));
    }
    return of(structuredClone(row)).pipe(delay(80));
  }

  /**
   * POST /api/files — mock ไม่ส่งไบนารีจริง
   * UI ยังส่ง dataUrl ได้เพื่อเปิดดูในเบราว์เซอร์
   */
  upload(input: FileUploadInput): Observable<StoredFile> {
    if (!input.originalName.trim()) {
      return throwError(() => new Error('กรุณาระบุชื่อไฟล์'));
    }
    const name = input.originalName.trim();
    const now = new Date().toISOString();
    const id = this.nextId++;
    const sizeBytes = input.sizeBytes ?? 100_000;
    const row: StoredFile = {
      id,
      originalName: name,
      mimeType: input.mimeType ?? null,
      sizeBytes,
      storageKey: `mock/uploads/${id}/${name}`,
      uploadedByUserId: input.uploadedByUserId ?? null,
      uploadedAt: now,
      url:
        input.dataUrl ||
        buildFilePreview(name, 'upload', 'ไฟล์อัปโหลดแบบ mock — รอ Phase 9'),
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    };
    this.filesSignal.update((list) => [row, ...list]);
    return of(structuredClone(row)).pipe(delay(200));
  }

  /** DELETE /api/files/:id */
  remove(id: number): Observable<void> {
    if (!this.getById(id)) {
      return throwError(() => new Error('ไม่พบไฟล์'));
    }
    this.filesSignal.update((list) => list.filter((f) => f.id !== id));
    return of(void 0).pipe(delay(100));
  }

  /** ใช้ตอน seed mock — ไม่ผ่าน delay */
  replaceAll(files: StoredFile[]): void {
    this.filesSignal.set(files);
    this.nextId = files.length ? Math.max(...files.map((f) => f.id)) + 1 : 1;
  }

  upsertLocal(file: StoredFile): void {
    this.filesSignal.update((list) => {
      const idx = list.findIndex((f) => f.id === file.id);
      if (idx < 0) {
        return [file, ...list];
      }
      const next = [...list];
      next[idx] = file;
      return next;
    });
    this.nextId = Math.max(this.nextId, file.id + 1);
  }
}
