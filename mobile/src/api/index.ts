import * as SecureStore from 'expo-secure-store';

import { createClient, type SessionStore } from './client';

const KEY = 'wt_session';

const secureSession: SessionStore = {
  get: () => SecureStore.getItemAsync(KEY),
  set: (value) => SecureStore.setItemAsync(KEY, value),
  clear: () => SecureStore.deleteItemAsync(KEY),
};

// The host is set per build with EXPO_PUBLIC_API_URL (see the README).
const baseUrl = process.env.EXPO_PUBLIC_API_URL;
if (!baseUrl) throw new Error('EXPO_PUBLIC_API_URL is not set');
// The session cookie travels with every request, so a release build needs TLS.
if (!__DEV__ && !baseUrl.startsWith('https://')) throw new Error('EXPO_PUBLIC_API_URL must be https');

export const api = createClient({ baseUrl, store: secureSession });
export { ApiError } from './client';
