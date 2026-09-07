import { Injectable, computed, signal } from '@angular/core';
import { Observable, delay, of, throwError } from 'rxjs';
import { MOCK_PASSWORD, MOCK_USERS } from '../mock/mock-data';
import { AccountType, User, UserStatus } from '../models/user.model';

const USERS_KEY = 'cpams_mock_users';
const PASSWORDS_KEY = 'cpams_mock_passwords';

export interface UserInput {
  username: string;
  email: string;
  fullName: string;
  accountType: AccountType;
  status: UserStatus;
  roleIds: number[];
  password?: string;
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly usersSignal = signal<User[]>(this.loadUsers());
  private passwords = this.loadPasswords();
  private nextId = this.calcNextId(this.usersSignal());

  readonly users = this.usersSignal.asReadonly();
  readonly activeCount = computed(
    () => this.usersSignal().filter((u) => u.status === 'ACTIVE').length
  );

  list(): Observable<User[]> {
    return of(structuredClone(this.usersSignal())).pipe(delay(250));
  }

  getById(id: number): User | undefined {
    return this.usersSignal().find((u) => u.id === id);
  }

  findByUsername(username: string): User | undefined {
    return this.usersSignal().find(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase()
    );
  }

  verifyPassword(userId: number, password: string): boolean {
    return (this.passwords[userId] ?? MOCK_PASSWORD) === password;
  }

  create(input: UserInput): Observable<User> {
    const username = input.username.trim();
    const email = input.email.trim();

    if (!username || !email || !input.fullName.trim()) {
      return throwError(() => new Error('กรุณากรอกข้อมูลให้ครบ'));
    }
    if (this.usersSignal().some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      return throwError(() => new Error('ชื่อผู้ใช้นี้ถูกใช้แล้ว'));
    }
    if (this.usersSignal().some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      return throwError(() => new Error('อีเมลนี้ถูกใช้แล้ว'));
    }
    if (input.accountType === 'SUPER_ADMIN') {
      return throwError(() => new Error('ไม่สามารถสร้าง Super Admin เพิ่มได้'));
    }
    if (input.accountType === 'USER' && input.roleIds.length === 0) {
      // อนุญาตได้ตามเอกสาร — User อาจยังไม่มีบทบาท
    }

    const user: User = {
      id: this.nextId++,
      username,
      email,
      fullName: input.fullName.trim(),
      accountType: input.accountType,
      status: input.status,
      roleIds: input.accountType === 'USER' ? [...input.roleIds] : [],
      lastLoginAt: null,
    };

    this.passwords[user.id] = input.password?.trim() || MOCK_PASSWORD;
    this.persistPasswords();
    this.usersSignal.update((list) => {
      const next = [...list, user];
      this.saveUsers(next);
      return next;
    });
    return of(structuredClone(user)).pipe(delay(300));
  }

  update(id: number, input: UserInput): Observable<User> {
    const current = this.getById(id);
    if (!current) {
      return throwError(() => new Error('ไม่พบผู้ใช้'));
    }
    if (current.accountType === 'SUPER_ADMIN') {
      return throwError(() => new Error('ไม่สามารถแก้ไขบัญชี Super Admin ได้'));
    }

    const username = input.username.trim();
    const email = input.email.trim();
    if (this.usersSignal().some((u) => u.id !== id && u.username.toLowerCase() === username.toLowerCase())) {
      return throwError(() => new Error('ชื่อผู้ใช้นี้ถูกใช้แล้ว'));
    }
    if (this.usersSignal().some((u) => u.id !== id && u.email.toLowerCase() === email.toLowerCase())) {
      return throwError(() => new Error('อีเมลนี้ถูกใช้แล้ว'));
    }
    if (input.accountType === 'SUPER_ADMIN') {
      return throwError(() => new Error('ไม่สามารถเปลี่ยนเป็น Super Admin ได้'));
    }

    const updated: User = {
      ...current,
      username,
      email,
      fullName: input.fullName.trim(),
      accountType: input.accountType,
      status: input.status,
      roleIds: input.accountType === 'USER' ? [...input.roleIds] : [],
    };

    if (input.password?.trim()) {
      this.passwords[id] = input.password.trim();
      this.persistPasswords();
    }

    this.usersSignal.update((list) => {
      const next = list.map((u) => (u.id === id ? updated : u));
      this.saveUsers(next);
      return next;
    });
    return of(structuredClone(updated)).pipe(delay(300));
  }

  updateStatus(id: number, status: UserStatus): Observable<User> {
    const current = this.getById(id);
    if (!current) {
      return throwError(() => new Error('ไม่พบผู้ใช้'));
    }
    if (current.accountType === 'SUPER_ADMIN') {
      return throwError(() => new Error('ไม่สามารถเปลี่ยนสถานะ Super Admin ได้'));
    }

    const updated: User = { ...current, status };
    this.usersSignal.update((list) => {
      const next = list.map((u) => (u.id === id ? updated : u));
      this.saveUsers(next);
      return next;
    });
    return of(structuredClone(updated)).pipe(delay(250));
  }

  touchLogin(id: number): void {
    this.usersSignal.update((list) => {
      const next = list.map((u) =>
        u.id === id ? { ...u, lastLoginAt: new Date().toISOString() } : u
      );
      this.saveUsers(next);
      return next;
    });
  }

  /** เมื่อลบบทบาท ให้ถอดออกจากผู้ใช้ทุกคน */
  detachRole(roleId: number): void {
    this.usersSignal.update((list) => {
      const next = list.map((u) => ({
        ...u,
        roleIds: u.roleIds.filter((id) => id !== roleId),
      }));
      this.saveUsers(next);
      return next;
    });
  }

  private loadUsers(): User[] {
    try {
      const raw = localStorage.getItem(USERS_KEY);
      if (raw) {
        return JSON.parse(raw) as User[];
      }
    } catch {
      /* ignore */
    }
    const seed = [
      ...structuredClone(MOCK_USERS),
      {
        id: 5,
        username: 'newbie',
        email: 'newbie@company.local',
        fullName: 'มาใหม่ ยังไม่มีบทบาท',
        accountType: 'USER' as const,
        status: 'ACTIVE' as const,
        roleIds: [] as number[],
        lastLoginAt: null,
      },
    ];
    this.saveUsers(seed);
    return seed;
  }

  private saveUsers(users: User[]): void {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  private loadPasswords(): Record<number, string> {
    try {
      const raw = localStorage.getItem(PASSWORDS_KEY);
      if (raw) {
        return JSON.parse(raw) as Record<number, string>;
      }
    } catch {
      /* ignore */
    }
    const map: Record<number, string> = {};
    for (const u of MOCK_USERS) {
      map[u.id] = MOCK_PASSWORD;
    }
    map[5] = MOCK_PASSWORD;
    this.passwords = map;
    this.persistPasswords();
    return map;
  }

  private persistPasswords(): void {
    localStorage.setItem(PASSWORDS_KEY, JSON.stringify(this.passwords));
  }

  private calcNextId(users: User[]): number {
    return users.reduce((max, u) => Math.max(max, u.id), 0) + 1;
  }
}
