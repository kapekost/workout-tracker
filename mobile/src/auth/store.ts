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

export function createAuthStore({ api, clearSession }: Deps) {
  return createStore<AuthState>()((set) => ({
    status: 'loading',
    profile: null,
    error: null,

    // Asks the server who the stored session belongs to. If it cannot answer, the user sees Login
    // with the reason; the stored session is kept, so the next launch tries again.
    async restore() {
      try {
        set({ status: 'signedIn', profile: await api.get<Profile>('/auth/me'), error: null });
      } catch (err) {
        const unreachable = !(err instanceof ApiError);
        set({ status: 'signedOut', profile: null, error: unreachable ? 'Cannot reach the server' : null });
      }
    },

    async login(username, password) {
      set({ error: null });
      try {
        set({ status: 'signedIn', profile: await api.post<Profile>('/auth/login', { username, password }) });
      } catch (err) {
        // The auth endpoints answer with deliberately generic messages, shown as they are.
        const message = err instanceof ApiError ? err.detail ?? 'Could not log in' : 'Cannot reach the server';
        set({ error: message });
      }
    },

    // The credential is dropped here even when the request fails, so a dead network cannot leave
    // someone logged in on a device they meant to log out of.
    async logout() {
      try {
        await api.post('/auth/logout');
      } catch {
        // offline: the local logout below still happens
      }
      await clearSession();
      set({ status: 'signedOut', profile: null, error: null });
    },

    signedOut() {
      set({ status: 'signedOut', profile: null, error: null });
    },
  }));
}
