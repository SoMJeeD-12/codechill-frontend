export type AccountType = 'SUPER_ADMIN' | 'ADMIN' | 'USER';
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'RESIGNED';

export interface User {
  id: number;
  username: string;
  email: string;
  fullName: string;
  accountType: AccountType;
  status: UserStatus;
  roleIds: number[];
  lastLoginAt: string | null;
}

export interface AuthSession {
  token: string;
  user: User;
  /** รวมสิทธิ์จากทุกบทบาท */
  permissions: import('./permission.model').Permission[];
}
