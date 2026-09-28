import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { Injector, inject } from '@angular/core';
import { tap } from 'rxjs/operators';
import { NavAttentionService } from '../services/nav-attention.service';

const BADGE_PATHS = /\/api\/(tickets|notifications)(\/|\?|$)/;

/**
 * ทำรายการใบปัญหา / แจ้งเตือนสำเร็จ → refreshBadges() ให้เลขเมนู + กระดิ่งตามทันที
 * (สร้างใบ, send-to-admin, claim, assign, start, resolutions, return-to-support,
 *  customer-notified, reopen, close, read-by-ref, read-all, :id/read)
 * ดึง service ตอนได้ response — กัน DI วนกับ HttpClient
 */
export const badgeRefreshInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.method === 'GET' || !BADGE_PATHS.test(req.url)) {
    return next(req);
  }
  const injector = inject(Injector);
  return next(req).pipe(
    tap((event) => {
      if (event instanceof HttpResponse && event.ok) {
        injector.get(NavAttentionService).refreshBadges();
      }
    })
  );
};
