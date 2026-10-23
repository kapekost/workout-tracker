// A fetch wrapper for the FastAPI backend. The session is the backend's `wt_session` cookie: it is
// read from Set-Cookie, kept in the injected store (SecureStore in the app) and sent back by hand.
// The store and fetch are parameters so the tests run in plain Node.

const SESSION_COOKIE = 'wt_session';
const TIMEOUT_MS = 8000;

export type SessionStore = {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
  clear(): Promise<void>;
};

export class ApiError extends Error {
  status: number;
  detail: string | null;

  constructor(message: string, status: number, detail: string | null) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

type Options = {
  baseUrl: string;
  store: SessionStore;
  fetchImpl?: typeof fetch;
  onUnauthorized?: () => void;
};

// Returns the new session id, '' when the server deleted the cookie, null when the header does
// not touch it. Fetch joins several Set-Cookie headers with a comma, and `expires` has one too, so
// the split only breaks before a `name=`.
function sessionFromSetCookie(header: string | null): string | null {
  const cookie = header?.split(/,\s*(?=[^;,=\s]+=)/).find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!cookie) return null;
  const [pair, ...attributes] = cookie.split(';');
  const value = pair.slice(SESSION_COOKIE.length + 1).trim().replace(/^"|"$/g, '');
  return attributes.some((a) => /^\s*max-age=0\s*$/i.test(a)) ? '' : value;
}

export function createClient({ baseUrl, store, fetchImpl = fetch, onUnauthorized }: Options) {
  const origin = baseUrl.replace(/\/+$/, '');

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const session = await store.get();
    if (session) headers.Cookie = `${SESSION_COOKIE}=${session}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      // 'omit' keeps the platform's own cookie jar out of it; the store is the only source. A
      // redirect is an error so the cookie is never carried to another host.
      const res = await fetchImpl(`${origin}/api${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'omit',
        redirect: 'error',
        signal: controller.signal,
      });

      const issued = sessionFromSetCookie(res.headers.get('set-cookie'));
      if (issued) await store.set(issued);
      else if (issued === '') await store.clear();

      if (!res.ok) {
        // /auth/ answers 401 as a plain statement (wrong password, nobody logged in), so only a 401
        // elsewhere means the session ended mid-use. A login that finished while this request was in
        // flight has replaced the session it was sent with, and is left alone.
        if (res.status === 401 && !path.startsWith('/auth/') && (await store.get()) === session) {
          await store.clear();
          onUnauthorized?.();
        }
        let detail: string | null = null;
        try {
          const json = await res.json();
          if (typeof json?.detail === 'string') detail = json.detail;
        } catch {
          // no JSON body
        }
        throw new ApiError(`API ${method} ${path} -> ${res.status}`, res.status, detail);
      }
      return (res.status === 204 ? undefined : await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
    put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
    delete: <T>(path: string) => request<T>('DELETE', path),
  };
}
