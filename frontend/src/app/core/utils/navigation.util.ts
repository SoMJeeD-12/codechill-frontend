import { Location } from '@angular/common';
import { Router } from '@angular/router';

/** ย้อนกลับตามประวัติในแอป ถ้าไม่มีให้ไป fallbackUrl */
export function navigateBack(location: Location, router: Router, fallbackUrl: string): void {
  const state = location.getState() as { navigationId?: number } | null;
  if (state?.navigationId && state.navigationId > 1) {
    location.back();
    return;
  }
  void router.navigateByUrl(fallbackUrl);
}
