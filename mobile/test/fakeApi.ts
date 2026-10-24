// A fetch that answers with the shapes backend/main.py returns, so a screen test fails when the
// app and the real API disagree. A request nobody described throws instead of returning a guess.
type Reply = { status?: number; body?: unknown; headers?: Record<string, string> };
type Route = (body: any) => Reply;

jest.mock('expo-secure-store', () => {
  const items = new Map<string, string>();
  return {
    getItemAsync: async (key: string) => items.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => void items.set(key, value),
    deleteItemAsync: async (key: string) => void items.delete(key),
  };
});

export const profile = { id: 1, username: 'kapekost', role: 'admin', icon: null, email: null };

export const routes: Record<string, Route> = {
  'POST /api/auth/login': (body) =>
    body.password === 'correct horse battery'
      ? { body: profile, headers: { 'Set-Cookie': 'wt_session=abc123; Path=/; HttpOnly' } }
      : { status: 401, body: { detail: 'invalid username or password' } },
};

// Installed when this file loads, not in a beforeEach: the app's API client reads `fetch` once, at import.
global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
  const path = new URL(String(url)).pathname;
  const route = routes[`${init?.method ?? 'GET'} ${path}`];
  if (!route) throw new Error(`fake API has no route for ${init?.method} ${path}`);
  const { status = 200, body, headers } = route(init?.body ? JSON.parse(String(init.body)) : undefined);
  return new Response(JSON.stringify(body), { status, headers });
}) as jest.Mock;
