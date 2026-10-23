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
// not touch it.
function sessionFromSetCookie(header: string | null): string | null {
  const match = header?.match(new RegExp(`(?:^|,\\s*)${SESSION_COOKIE}=([^;,]*)([^,]*)`));
  if (!match) return null;
  const value = match[1].replace(/^"|"$/g, '');
  return /max-age=0/i.test(match[2]) ? '' : value;
}

export function createClient({ baseUrl, store, fetchImpl = fetch, onUnauthorized }: Options) {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const session = await store.get();
    if (session) headers.Cookie = `${SESSION_COOKIE}=${session}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      // 'omit' keeps the platform's own cookie jar out of it; the store is the only source.
      res = await fetchImpl(`${baseUrl}/api${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'omit',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const issued = sessionFromSetCookie(res.headers.get('set-cookie'));
    if (issued) await store.set(issued);
    else if (issued === '') await store.clear();

    if (!res.ok) {
      // /auth/ answers 401 as a plain statement (wrong password, nobody logged in), so only a 401
      // elsewhere means the session ended mid-use.
      if (res.status === 401 && !path.startsWith('/auth/')) {
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
  }

  return {
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
    put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
    delete: <T>(path: string) => request<T>('DELETE', path),
  };
}
