export type AccountType = 'SUPER_ADMIN' | 'ADMIN' | 'USER';
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'RESIGNED';

/** RoleSummaryDto — บทบาทแบบย่อที่ฝังมากับ user */
export interface RoleSummary {
  id: number;
  name: string;
  description: string | null;
}

/** UserSummaryDto — ผู้ใช้แบบย่อที่ฝังมากับ record อื่น */
export interface UserSummary {
  id: number;
  username: string;
  fullName: string;
}

/** UserResponseDto */
export interface User {
  id: number;
  employeeCode: string | null;
  username: string;
  email: string | null;
  fullName: string;
  nickname: string | null;
  phone: string | null;
  position: string | null;
  avatarUrl: string | null;
  lineUserId: string | null;
  accountType: AccountType;
  status: UserStatus;
  lastLoginAt: string | null;
  /** SUPER_ADMIN/ADMIN มักเป็น [] โดยตั้งใจ */
  roles: RoleSummary[];
  createdAt: string;
  updatedAt: string;
}

/** โปรไฟล์จาก /auth/login และ /auth/me */
export interface AuthProfile {
  id: number;
  username: string;
  fullName: string;
  nickname: string | null;
  email: string | null;
  position: string | null;
  avatarUrl: string | null;
  accountType: AccountType;
  status: UserStatus;
  isSuperAdmin: boolean;
  roles: RoleSummary[];
  /** เช่น "customer.view", "ticket.resolve" */
  permissions: string[];
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: User;
  /** สิทธิ์แบบ string จาก API — ใช้ includes('customer.view') */
  permissions: string[];
}

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: 'ปฏิบัติงาน',
  SUSPENDED: 'พักงาน',
  RESIGNED: 'สิ้นสุดการปฏิบัติงาน',
};

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  USER: 'User',
};

export function mapAuthProfileToUser(profile: AuthProfile): User {
  return {
    id: profile.id,
    employeeCode: null,
    username: profile.username,
    email: profile.email ?? null,
    fullName: profile.fullName,
    nickname: profile.nickname ?? null,
    phone: null,
    position: profile.position ?? null,
    avatarUrl: profile.avatarUrl ?? null,
    lineUserId: null,
    accountType: profile.accountType,
    status: profile.status,
    lastLoginAt: null,
    roles: profile.roles ?? [],
    createdAt: '',
    updatedAt: '',
  };
}
