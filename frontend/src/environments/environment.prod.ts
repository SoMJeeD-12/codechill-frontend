import { DevAccount } from './dev-account';

export type { DevAccount };

export const environment = {
  production: true,
  apiBaseUrl: 'http://192.168.1.130:3000/api',
  /** ว่างเสมอ — รหัสผ่านทดสอบต้องไม่ถูก build ติดไปด้วย */
  devAccounts: [] as DevAccount[],
};
