import { DevAccount } from './dev-account';

export type { DevAccount };

export const environment = {
  production: false,
  /** เครื่องเดียวกับ BE — ใช้ IP แลน ไม่ใช้ localhost เพราะมือถือจะเรียกหาตัวเอง */
  apiBaseUrl: 'http://192.168.1.130:3000/api',
  /** บัญชีทดสอบ — อยู่เฉพาะในไฟล์นี้ จะไม่ถูก build ติด production */
  devAccounts: [
    { key: '1', label: 'SuperAdmin', username: 'SuperAdmin', password: 'CchSuperAdmin@2026' },
    { key: '2', label: 'Admin (somchai)', username: 'somchai', password: 'Demo@1234' },
    { key: '3', label: 'User (pranee)', username: 'pranee', password: 'Demo@1234' },
    { key: '4', label: 'User (wichai)', username: 'wichai', password: 'Demo@1234' },
    { key: '5', label: 'User (tom)', username: 'tom', password: 'Demo@1234' },
  ] as DevAccount[],
};
