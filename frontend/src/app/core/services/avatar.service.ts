import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';
import { resolveApiFileUrl } from '../../shared/utils/download-blob';

/**
 * รูปผู้ใช้จาก `/api/users/:id/avatar?v=...` — ต้องแนบ token จึงดึงเป็น blob แล้วทำ object URL
 * cache ด้วย URL เต็ม (รวม ?v=) · เมื่อ ?v= ของ path เดิมเปลี่ยน จะ revoke object URL ตัวเก่า
 * URL ภายนอก (ไม่ขึ้นต้น /api/) ใช้ตรง ๆ · ไม่มีรูป / 404 → null (ให้ผู้เรียกแสดงอักษรย่อ)
 */
@Injectable({ providedIn: 'root' })
export class AvatarService {
  private readonly http = inject(HttpClient);
  private readonly cache = new Map<string, Observable<string | null>>();
  private readonly objectUrls = new Map<string, { key: string; objectUrl: string }>();

  src(avatarUrl: string | null | undefined): Observable<string | null> {
    const raw = avatarUrl?.trim();
    if (!raw) {
      return of(null);
    }
    if (!raw.startsWith('/api/')) {
      return of(raw);
    }
    const hit = this.cache.get(raw);
    if (hit) {
      return hit;
    }
    const path = raw.split('?')[0];
    const req = this.http.get(resolveApiFileUrl(raw), { responseType: 'blob' }).pipe(
      map((blob) => {
        const objectUrl = URL.createObjectURL(blob);
        const prev = this.objectUrls.get(path);
        if (prev && prev.key !== raw) {
          URL.revokeObjectURL(prev.objectUrl);
          this.cache.delete(prev.key);
        }
        this.objectUrls.set(path, { key: raw, objectUrl });
        return objectUrl as string | null;
      }),
      catchError((err: { status?: number }) => {
        if (err?.status !== 404) {
          this.cache.delete(raw);
        }
        return of(null);
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    this.cache.set(raw, req);
    return req;
  }

  /** ออกจากระบบ / เปลี่ยนผู้ใช้ */
  clear(): void {
    for (const { objectUrl } of this.objectUrls.values()) {
      URL.revokeObjectURL(objectUrl);
    }
    this.objectUrls.clear();
    this.cache.clear();
  }
}
