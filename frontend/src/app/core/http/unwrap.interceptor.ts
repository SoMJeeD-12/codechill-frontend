import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { map } from 'rxjs/operators';

interface ApiEnvelope {
  success?: boolean;
  data?: unknown;
  message?: string | null;
}

/** แกะ { success, data, message } ที่เดียว — component ได้ data ตรง ๆ */
export const unwrapInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    map((event) => {
      if (!(event instanceof HttpResponse) || event.body == null || typeof event.body !== 'object') {
        return event;
      }
      const body = event.body as ApiEnvelope;
      if (body.success === true && 'data' in body) {
        return event.clone({ body: body.data });
      }
      return event;
    })
  );
