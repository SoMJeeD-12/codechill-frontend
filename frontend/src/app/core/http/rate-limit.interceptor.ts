import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, Injector, inject, signal } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ApiToastService } from '../../shared/services/api-toast.service';

/** BE ไม่ส่ง Retry-After (หรืออ่าน header ข้ามโดเมนไม่ได้) — รอค่าเริ่มต้นนี้ */
const DEFAULT_RETRY_AFTER_S = 60;
const MAX_RETRY_AFTER_S = 15 * 60;

function isLoginUrl(url: string): boolean {
  return url.includes('/auth/login');
}

/** Retry-After เป็นวินาที หรือวันที่ HTTP — คืนจำนวนวินาทีที่ต้องรอ */
export function retryAfterSeconds(err: HttpErrorResponse): number {
  const raw = err.headers?.get('Retry-After')?.trim();
  if (raw) {
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(Math.ceil(seconds), MAX_RETRY_AFTER_S);
    }
    const at = Date.parse(raw);
    if (Number.isFinite(at)) {
      return Math.min(Math.max(0, Math.ceil((at - Date.now()) / 1000)), MAX_RETRY_AFTER_S);
    }
  }
  return DEFAULT_RETRY_AFTER_S;
}

/** สถานะถูกจำกัดจำนวนคำขอ (HTTP 429) — poll เบื้องหลังหยุดจนพ้นเวลา · หน้าล็อกอินปิดปุ่มตามนี้ */
@Injectable({ providedIn: 'root' })
export class RateLimitService {
  /** epoch ms ที่ยิงคำขอทั่วไปได้อีกครั้ง (0 = ไม่ถูกจำกัด) */
  readonly blockedUntil = signal(0);
  /** epoch ms ที่ล็อกอินได้อีกครั้ง — แยกจากคำขอทั่วไป (เพดานล็อกอินนับต่อ IP) */
  readonly loginBlockedUntil = signal(0);

  isBlocked(now = Date.now()): boolean {
    return this.blockedUntil() > now;
  }

  note(err: HttpErrorResponse, login: boolean): void {
    const until = Date.now() + retryAfterSeconds(err) * 1000;
    const target = login ? this.loginBlockedUntil : this.blockedUntil;
    target.set(Math.max(target(), until));
  }
}

/**
 * 429 → แสดง message ไทยจาก BE เป็น toast (ครั้งเดียวต่อช่วงที่ถูกจำกัด) แล้วโยน error ต่อ
 * ไม่ยิงซ้ำอัตโนมัติ — หน้าล็อกอินแสดงเองพร้อมนับถอยหลัง จึงไม่ toast
 */
export const rateLimitInterceptor: HttpInterceptorFn = (req, next) => {
  const injector = inject(Injector);
  return next(req).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 429) {
        return throwError(() => err);
      }
      const limiter = injector.get(RateLimitService);
      const login = isLoginUrl(req.url);
      const wasBlocked = login ? false : limiter.isBlocked();
      limiter.note(err, login);
      if (!login && !wasBlocked) {
        injector
          .get(ApiToastService)
          .error(err, 'มีการเรียกใช้งานถี่เกินไป กรุณารอสักครู่แล้วลองใหม่', 6000);
      }
      return throwError(() => err);
    })
  );
};
