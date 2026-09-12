import { HttpErrorResponse } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

/**
 * กลืน error เพื่อไม่ให้ทั้งหน้าพัง แต่ทิ้งร่องรอยใน console
 * (กันสรุปผิดว่า "ฟีเจอร์ไม่มี" เมื่อจริง ๆ เป็น 403/404)
 */
export function swallowHttpError<T>(fallback: T, label?: string) {
  return (source: Observable<T>): Observable<T> =>
    source.pipe(
      catchError((err: unknown) => {
        warnHttpError(err, label);
        return of(fallback);
      })
    );
}

export function warnHttpError(err: unknown, label?: string): void {
  const prefix = label ? `[${label}]` : '[HTTP]';
  if (err instanceof HttpErrorResponse) {
    console.warn(prefix, err.status, err.url ?? '(no url)', err.message);
    return;
  }
  console.warn(prefix, err);
}
