/** โลโก้ในเอกสารพิมพ์ — ไฟล์เดียวกับที่เว็บใช้ (frontend/public/logo.png) */
export const PRINT_LOGO_SRC =
  typeof location !== 'undefined' ? `${location.origin}/logo.png` : 'logo.png';
