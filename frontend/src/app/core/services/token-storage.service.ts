import { Injectable } from '@angular/core';

export type RefreshPolicy = 'local' | 'session';

export const REFRESH_TOKEN_KEY = 'cpams_refresh_token';
export const ACCESS_TOKEN_KEY = 'cpams_access_token';
const REFRESH_LOCK_KEY = 'cpams_refresh_lock';

export interface RefreshLock {
  id: string;
  exp: number;
}

export interface StoredAuthTokens {
  refreshToken: string;
  /** ว่างได้ — มีแค่ refresh ต้องไปขอ access ใหม่ ไม่ถือว่าพัง */
  accessToken: string | null;
  policy: RefreshPolicy;
}

@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  /** อ่านคู่กันในที่เดียวกัน — ห้ามหยิบ access จากอีกที่เก็บมาประกบ refresh */
  getStoredTokens(): StoredAuthTokens | null {
    try {
      const localRefresh = readItem(localStorage, REFRESH_TOKEN_KEY);
      if (localRefresh) {
        return {
          refreshToken: localRefresh,
          accessToken: readItem(localStorage, ACCESS_TOKEN_KEY),
          policy: 'local',
        };
      }
      const sessionRefresh = readItem(sessionStorage, REFRESH_TOKEN_KEY);
      if (sessionRefresh) {
        return {
          refreshToken: sessionRefresh,
          accessToken: readItem(sessionStorage, ACCESS_TOKEN_KEY),
          policy: 'session',
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  getRefreshToken(): { token: string; policy: RefreshPolicy } | null {
    const stored = this.getStoredTokens();
    if (!stored) {
      return null;
    }
    return { token: stored.refreshToken, policy: stored.policy };
  }

  getAccessToken(): string | null {
    return this.getStoredTokens()?.accessToken ?? null;
  }

  /**
   * เขียนทับใบที่ใช้ตามนโยบายของแท็บนี้
   * ห้ามลบ localStorage ตอนเขียนแบบ session — จะไปล้าง refresh ของแท็บที่ติ๊กจดจำฉันไว้
   */
  setTokens(accessToken: string, refreshToken: string, policy: RefreshPolicy): void {
    if (!accessToken?.trim() || !refreshToken?.trim()) {
      return;
    }
    try {
      if (policy === 'local') {
        localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
        localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
        sessionStorage.removeItem(REFRESH_TOKEN_KEY);
        sessionStorage.removeItem(ACCESS_TOKEN_KEY);
        return;
      }

      sessionStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
      sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    } catch {
      /* storage เต็มหรือถูกบล็อก — อย่าให้ล้มทั้งแอป */
    }
  }

  /** ตอน login สลับนโยบาย — ล้างของเก่าทั้งสองที่ก่อนเขียนใบใหม่ */
  replaceTokens(accessToken: string, refreshToken: string, policy: RefreshPolicy): void {
    this.clearRefreshToken();
    this.setTokens(accessToken, refreshToken, policy);
  }

  clearRefreshToken(): void {
    removeItem(localStorage, REFRESH_TOKEN_KEY);
    removeItem(localStorage, ACCESS_TOKEN_KEY);
    removeItem(sessionStorage, REFRESH_TOKEN_KEY);
    removeItem(sessionStorage, ACCESS_TOKEN_KEY);
    this.clearRefreshLock();
  }

  getRefreshLock(): RefreshLock | null {
    try {
      const raw = readItem(localStorage, REFRESH_LOCK_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as Partial<RefreshLock>;
      if (typeof parsed.id !== 'string' || typeof parsed.exp !== 'number' || !Number.isFinite(parsed.exp)) {
        return null;
      }
      return { id: parsed.id, exp: parsed.exp };
    } catch {
      return null;
    }
  }

  setRefreshLock(id: string, exp: number): void {
    try {
      localStorage.setItem(REFRESH_LOCK_KEY, JSON.stringify({ id, exp }));
    } catch {
      /* ไม่มีล็อกก็ยัง refresh ได้ — อย่าทำให้บูตพัง */
    }
  }

  clearRefreshLock(ownerId?: string): void {
    try {
      const current = this.getRefreshLock();
      if (ownerId && current && current.id !== ownerId) {
        return;
      }
      localStorage.removeItem(REFRESH_LOCK_KEY);
    } catch {
      /* ignore */
    }
  }
}

function readItem(storage: Storage, key: string): string | null {
  try {
    const value = storage.getItem(key);
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

function removeItem(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    /* ignore */
  }
}
