import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { apiErrorMessage } from '../http/api-error';
import { asList, pruneUndefined, toHttpParams } from '../http/api.util';
import {
  Attachment,
  AttachmentListParams,
  AttachmentRefType,
  AttachmentUpdateInput,
  AttachmentUploadInput,
} from '../models/attachment.model';
import { downloadAuthorizedBlob } from '../../shared/utils/download-blob';

type ApiAttachment = {
  id?: number;
  refType?: string;
  refId?: number;
  fileName?: string;
  originalName?: string;
  fileSize?: number | null;
  sizeBytes?: number | null;
  mimeType?: string | null;
  note?: string | null;
  downloadUrl?: string | null;
  createdAt?: string;
  /** object key — ห้ามโชว์/ส่งต่อใน UI */
  fileUrl?: string | null;
  storageKey?: string | null;
  objectKey?: string | null;
};

/**
 * API กลางไฟล์แนบ — /api/attachments
 * ห้ามใช้กับเอกสารโปรเจกต์ (ยังใช้ POST /projects/:id/documents)
 */
@Injectable({ providedIn: 'root' })
export class AttachmentService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/attachments`;

  list(params: AttachmentListParams): Observable<Attachment[]> {
    return this.http
      .get<ApiAttachment[] | { items: ApiAttachment[] }>(this.base, {
        params: toHttpParams({
          refType: params.refType,
          refId: params.refId,
        }),
      })
      .pipe(
        map((body) => asList(body).map((row) => this.normalize(row))),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  upload(input: AttachmentUploadInput): Observable<Attachment> {
    const form = new FormData();
    form.append('file', input.file, input.file.name);
    form.append('refType', input.refType);
    form.append('refId', String(input.refId));
    const note = input.note?.trim();
    if (note) {
      form.append('note', note);
    }
    return this.http.post<ApiAttachment>(this.base, form).pipe(
      map((row) => this.normalize(row)),
      catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
    );
  }

  update(id: number, input: AttachmentUpdateInput): Observable<Attachment> {
    const note =
      input.note == null ? null : input.note.trim() || null;
    return this.http
      .patch<ApiAttachment>(`${this.base}/${id}`, pruneUndefined({ note }))
      .pipe(
        map((row) => this.normalize(row)),
        catchError((err) => throwError(() => new Error(apiErrorMessage(err))))
      );
  }

  remove(id: number): Observable<void> {
    return this.http
      .delete<void>(`${this.base}/${id}`)
      .pipe(catchError((err) => throwError(() => new Error(apiErrorMessage(err)))));
  }

  /** GET /attachments/:id/download — blob + Authorization ห้ามใช้ &lt;a href&gt; ตรง ๆ */
  download(row: Attachment): Observable<void> {
    return downloadAuthorizedBlob(
      this.http,
      row.downloadUrl,
      row.fileName || 'download'
    );
  }

  private normalize(row: ApiAttachment | null | undefined): Attachment {
    const id = Number(row?.id) || 0;
    const refType = (row?.refType ?? 'TICKET') as AttachmentRefType;
    const refId = Number(row?.refId) || 0;
    const fileName =
      (typeof row?.fileName === 'string' && row.fileName.trim()) ||
      (typeof row?.originalName === 'string' && row.originalName.trim()) ||
      `attachment-${id || 'file'}`;
    const fileSizeRaw = row?.fileSize ?? row?.sizeBytes;
    const fileSize =
      typeof fileSizeRaw === 'number' && Number.isFinite(fileSizeRaw)
        ? fileSizeRaw
        : null;
    // ใช้ downloadUrl จาก BE · ถ้าไม่มี ใช้ path ที่เอกสาร API ระบุ (ไม่ใช่ object key)
    const downloadUrl =
      (typeof row?.downloadUrl === 'string' && row.downloadUrl.trim()) ||
      `/api/attachments/${id}/download`;
    return {
      id,
      refType,
      refId,
      fileName,
      fileSize,
      mimeType: row?.mimeType?.trim() || null,
      note: row?.note?.trim() || null,
      downloadUrl,
      createdAt: row?.createdAt ?? '',
    };
  }
}
