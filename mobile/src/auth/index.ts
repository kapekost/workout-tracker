import { useStore } from 'zustand';

import { api, clearSession, setUnauthorizedHandler } from '../api';
import { createAuthStore, type AuthState } from './store';

export const authStore = createAuthStore({ api, clearSession });
setUnauthorizedHandler(() => authStore.getState().signedOut());

export const useAuth = <T>(selector: (state: AuthState) => T) => useStore(authStore, selector);
