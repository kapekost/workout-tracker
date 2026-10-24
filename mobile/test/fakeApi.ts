// A fetch that answers with the shapes backend/main.py returns, so a screen test fails when the
// app and the real API disagree. A request nobody described throws, and the test then fails even
// when the app swallowed the error into its generic message.
type Reply = { status?: number; body?: unknown; headers?: Record<string, string> };
type Route = (body: any) => Reply;

const mockSession = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => mockSession.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => void mockSession.set(key, value),
  deleteItemAsync: async (key: string) => void mockSession.delete(key),
}));

export const profile = { id: 1, username: 'kapekost', role: 'admin', icon: null, email: null };

export const routes: Record<string, Route> = {
  'POST /api/auth/login': (body) =>
    body.password === 'correct horse battery'
      ? { body: profile, headers: { 'Set-Cookie': 'wt_session=abc123; Path=/; HttpOnly' } }
      : { status: 401, body: { detail: 'invalid username or password' } },
};

const unhandled: string[] = [];

// Installed when this file loads, not in a beforeEach: the app's API client reads `fetch` once, at import.
global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
  const call = `${init?.method ?? 'GET'} ${new URL(String(url)).pathname}`;
  const route = routes[call];
  if (!route) {
    unhandled.push(call);
    throw new Error(`fake API has no route for ${call}`);
  }
  const { status = 200, body, headers } = route(init?.body ? JSON.parse(String(init.body)) : undefined);
  return new Response(JSON.stringify(body), { status, headers });
}) as jest.Mock;

beforeEach(() => {
  mockSession.clear();
  unhandled.length = 0;
  (global.fetch as jest.Mock).mockClear();
});

afterEach(() => {
  expect(unhandled).toEqual([]);
});
