import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  const withToken = (r: HttpRequest<unknown>) => {
    const token = auth.accessToken;
    return token
      ? r.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : r;
  };

  return next(withToken(req)).pipe(
    catchError((err: HttpErrorResponse) => {
      // 401 จากเส้น auth เอง = ต่ออายุไม่ได้จริง อย่าวนซ้ำ
      if (err.status !== 401 || req.url.includes('/auth/')) {
        return throwError(() => err);
      }
      return auth.refresh().pipe(switchMap(() => next(withToken(req))));
    })
  );
};
