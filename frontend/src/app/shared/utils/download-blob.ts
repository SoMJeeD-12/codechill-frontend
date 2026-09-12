/**
 * ดาวน์โหลดไฟล์ผ่าน HttpClient + Authorization (interceptor)
 * ห้ามใช้ &lt;a href&gt; ตรง ๆ เพราะจะไม่มี token
 */
import { HttpClient, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { Observable, from, throwError } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { apiErrorMessage } from '../../core/http/api-error';

export function resolveApiFileUrl(downloadUrl: string, fallbackPath = '/documents/0/download'): string {
  const raw = (downloadUrl || '').trim();
  if (!raw) {
    return `${environment.apiBaseUrl}${fallbackPath.startsWith('/') ? fallbackPath : `/${fallbackPath}`}`;
  }
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }
  if (raw.startsWith('/api/')) {
    const origin = environment.apiBaseUrl.replace(/\/api\/?$/, '');
    return `${origin}${raw}`;
  }
  if (raw.startsWith('/')) {
    return `${environment.apiBaseUrl}${raw}`;
  }
  return `${environment.apiBaseUrl}/${raw}`;
}

export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = fileName || 'download';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

/**
 * ดึงชื่อไฟล์จาก Content-Disposition
 * รองรับ `filename*=UTF-8''...` (ชื่อไทย) และ `filename="..."`
 */
export function fileNameFromContentDisposition(
  header: string | null,
  fallback: string
): string {
  if (!header) {
    return fallback;
  }
  const utf8 = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1].trim().replace(/^"|"$/g, ''));
    } catch {
      /* fall through */
    }
  }
  const plain = /filename\s*=\s*("?)([^";]+)\1/i.exec(header);
  if (plain?.[2]) {
    return plain[2].trim();
  }
  return fallback;
}

export function blobHttpError(err: unknown): Observable<never> {
  if (err instanceof HttpErrorResponse && err.error instanceof Blob) {
    return from(err.error.text()).pipe(
      switchMap((text) => {
        try {
          const json = JSON.parse(text) as { message?: string };
          if (typeof json.message === 'string' && json.message.trim()) {
            return throwError(() => new Error(json.message));
          }
        } catch {
          /* fall through */
        }
        return throwError(() => new Error(apiErrorMessage(err)));
      })
    );
  }
  return throwError(() => new Error(apiErrorMessage(err)));
}

/** ยิง GET blob แล้วเซฟไฟล์ — แนบ Authorization ผ่าน interceptor อัตโนมัติ */
export function downloadAuthorizedBlob(
  http: HttpClient,
  downloadUrl: string,
  fileName: string
): Observable<void> {
  const url = resolveApiFileUrl(downloadUrl);
  return http.get(url, { responseType: 'blob', observe: 'response' }).pipe(
    tap((res: HttpResponse<Blob>) => {
      const name = fileNameFromContentDisposition(
        res.headers.get('Content-Disposition'),
        fileName || 'download'
      );
      triggerBlobDownload(res.body as Blob, name);
    }),
    map(() => void 0),
    catchError((err) => blobHttpError(err))
  );
}
