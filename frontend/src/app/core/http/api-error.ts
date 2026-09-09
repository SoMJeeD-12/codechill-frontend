import { HttpErrorResponse } from '@angular/common/http';

/** ดึงข้อความไทยจาก error envelope ของ API */
export function apiErrorMessage(err: unknown, fallback = 'เกิดข้อผิดพลาด'): string {
  if (err instanceof HttpErrorResponse) {
    const body = err.error as { message?: string } | string | null;
    if (body && typeof body === 'object' && typeof body.message === 'string' && body.message.trim()) {
      return body.message;
    }
    if (typeof body === 'string' && body.trim()) {
      const pre = /<pre>([^<]+)<\/pre>/i.exec(body);
      if (pre?.[1]) {
        return pre[1].trim();
      }
      const stripped = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (stripped) {
        return stripped.slice(0, 200);
      }
    }
    if (err.status === 404) {
      return 'ไม่พบข้อมูลหรือ API ยังไม่มีเส้นทางนี้';
    }
    if (err.status === 0) {
      return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจว่า backend รันที่พอร์ต 3000 และ CORS อนุญาต origin นี้';
    }
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
}
