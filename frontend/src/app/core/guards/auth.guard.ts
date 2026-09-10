import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.whenReady();

  if (auth.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/login']);
};

/** ห้ามเข้าหน้า login ถ้ามี session อยู่แล้ว (กันล็อกอินซ้อน / กดย้อนกลับ) */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.whenReady();

  if (!auth.isAuthenticated()) {
    return true;
  }

  return router.parseUrl(auth.defaultAppPath());
};

/** พาไปหน้าแรกตามสิทธิ์ (หรือหน้าขอสิทธิ์ถ้า permissions ว่าง) */
export const defaultAppRedirectGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  return router.parseUrl(auth.defaultAppPath());
};
