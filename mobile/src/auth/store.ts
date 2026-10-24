import { createStore } from 'zustand/vanilla';

import { ApiError } from '../api/client.ts';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

export type Profile = {
  id: number;
  username: string;
  role: string;
  icon: string | null;
  email: string | null;
};

export type AuthState = {
  status: AuthStatus;
  profile: Profile | null;
  error: string | null;
  restore(): Promise<void>;
  login(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
  // The server ended the session; the stored credential is already gone.
  signedOut(): void;
};

type Deps = {
  api: {
    get<T>(path: string): Promise<T>;
    post<T>(path: string, body?: unknown): Promise<T>;
  };
  clearSession(): Promise<void>;
};

const TRY_AGAIN = 'Something went wrong. Check your connection and try again.';

export function createAuthStore({ api, clearSession }: Deps) {
  return createStore<AuthState>()((set) => ({
    status: 'loading',
    profile: null,
    error: null,

    // Asks the server who the stored session belongs to. A 401 means the session is over: plain
    // Login. Any other failure (server error, no network, an unreadable store) shows Login with a
    // reason, and the stored session is kept, so the next launch tries again.
    async restore() {
      try {
        set({ status: 'signedIn', profile: await api.get<Profile>('/auth/me'), error: null });
      } catch (err) {
        const over = err instanceof ApiError && err.status === 401;
        set({ status: 'signedOut', profile: null, error: over ? null : TRY_AGAIN });
      }
    },

    async login(username, password) {
      set({ error: null });
      try {
        set({ status: 'signedIn', profile: await api.post<Profile>('/auth/login', { username, password }) });
      } catch (err) {
        // The auth endpoints answer with deliberately generic messages, shown as they are.
        set({ error: err instanceof ApiError ? err.detail ?? 'Could not log in' : TRY_AGAIN });
      }
    },

    // The local credential is dropped even when the request fails, so a dead network cannot leave
    // someone logged in on a device they meant to log out of. The server session is then only ended
    // if the request got through; otherwise it expires on its own.
    async logout() {
      try {
        await api.post('/auth/logout');
      } catch {
        // offline: the local logout below still happens
      }
      try {
        await clearSession();
      } finally {
        set({ status: 'signedOut', profile: null, error: null });
      }
    },

    signedOut() {
      set({ status: 'signedOut', profile: null, error: null });
    },
  }));
}
