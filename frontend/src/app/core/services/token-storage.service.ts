import { Injectable } from '@angular/core';

type RefreshPolicy = 'local' | 'session';

const REFRESH_TOKEN_KEY = 'cpams_refresh_token';

@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  getRefreshToken(): { token: string; policy: RefreshPolicy } | null {
    const localToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (localToken) {
      return { token: localToken, policy: 'local' };
    }

    const sessionToken = sessionStorage.getItem(REFRESH_TOKEN_KEY);
    if (sessionToken) {
      return { token: sessionToken, policy: 'session' };
    }

    return null;
  }

  setRefreshToken(token: string, policy: RefreshPolicy): void {
    // กันกรณีมีทั้งสองที่
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);

    if (policy === 'local') {
      localStorage.setItem(REFRESH_TOKEN_KEY, token);
      return;
    }

    sessionStorage.setItem(REFRESH_TOKEN_KEY, token);
  }

  clearRefreshToken(): void {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  }
}

