import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError, timeout } from 'rxjs';
import { AuthService } from '../services/auth.service';

function isAuthRefresh(url: string): boolean {
  return url.includes('/auth/refresh');
}

function isAuthLogin(url: string): boolean {
  return url.includes('/auth/login');
}

/** refresh/login ต้องไม่แนบ access — ใบหมดอายุทำให้ BE ปฏิเสธ refresh ทั้งที่ body ถูก */
function skipAccessHeader(url: string): boolean {
  return isAuthRefresh(url) || isAuthLogin(url);
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  const withToken = (r: HttpRequest<unknown>) => {
    if (skipAccessHeader(r.url)) {
      return r.clone({ headers: r.headers.delete('Authorization') });
    }
    const token = auth.accessToken;
    return token
      ? r.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : r;
  };

  return next(withToken(req)).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401 || isAuthRefresh(req.url) || isAuthLogin(req.url)) {
        return throwError(() => err);
      }
      if (req.headers.get('x-auth-retried') === '1') {
        return throwError(() => err);
      }
      const retriedReq = req.clone({ setHeaders: { 'x-auth-retried': '1' } });
      return auth.refresh().pipe(
        timeout(8000),
        switchMap(() => next(withToken(retriedReq))),
      );
    }),
  );
};
