import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { map } from 'rxjs/operators';
import { ApiEnvelopeService } from './api-envelope.service';

interface ApiEnvelope {
  success?: boolean;
  data?: unknown;
  message?: string | null;
}

/** แกะ { success, data, message } ที่เดียว — component ได้ data ตรง ๆ */
export const unwrapInterceptor: HttpInterceptorFn = (req, next) => {
  const envelope = inject(ApiEnvelopeService);
  return next(req).pipe(
    map((event) => {
      if (!(event instanceof HttpResponse) || event.body == null || typeof event.body !== 'object') {
        return event;
      }
      const body = event.body as ApiEnvelope;
      if (body.success === true && 'data' in body) {
        envelope.setMessage(body.message);
        return event.clone({ body: body.data });
      }
      return event;
    })
  );
};
