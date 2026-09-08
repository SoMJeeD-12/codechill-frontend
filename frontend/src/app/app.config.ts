import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { DateAdapter, MAT_DATE_FORMATS, MAT_DATE_LOCALE } from '@angular/material/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import {
  THAI_CE_DATE_FORMATS,
  ThaiCeDateAdapter,
} from './core/date/thai-ce-date-adapter';
import { authInterceptor } from './core/http/auth.interceptor';
import { unwrapInterceptor } from './core/http/unwrap.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor, unwrapInterceptor])),
    provideAnimationsAsync(),
    { provide: MAT_DATE_LOCALE, useValue: 'th-TH' },
    { provide: DateAdapter, useClass: ThaiCeDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: THAI_CE_DATE_FORMATS },
  ],
};
