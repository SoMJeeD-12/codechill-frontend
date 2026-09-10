import { HttpContext, HttpContextToken, HttpErrorResponse } from '@angular/common/http';

/**
 * แนบกับ request ย่อย (แท็บ / การ์ด / ดรอปดาวน์) ที่ 403 ไม่ควรเด้ง toast รวมหน้า
 * ใช้คู่กับ isSilentForbidden / catch ใน service หรือหน้าจอ
 */
export const OPTIONAL_RESOURCE = new HttpContextToken<boolean>(() => false);

export function optionalResourceOptions(): { context: HttpContext } {
  return { context: new HttpContext().set(OPTIONAL_RESOURCE, true) };
}

export function isOptionalResource(context: HttpContext | undefined): boolean {
  return context?.get(OPTIONAL_RESOURCE) === true;
}

/** 403 จาก request ที่ทำเครื่องหมาย optional — ไม่ควร snack กลางหน้า */
export function isSilentForbidden(err: unknown): boolean {
  return err instanceof HttpErrorResponse && err.status === 403;
}
