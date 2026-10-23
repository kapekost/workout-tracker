import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ApiError, createClient, type SessionStore } from './client.ts';

function memoryStore(initial: string | null = null) {
  const store = {
    value: initial,
    get: async () => store.value,
    set: async (v: string) => {
      store.value = v;
    },
    clear: async () => {
      store.value = null;
    },
  };
  return store satisfies SessionStore & { value: string | null };
}

type Call = { url: string; init: RequestInit };

function fakeFetch(status: number, body?: unknown, setCookie?: string) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const headers = new Headers();
    if (setCookie) headers.set('set-cookie', setCookie);
    return new Response(status === 204 ? null : JSON.stringify(body ?? {}), { status, headers });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const baseUrl = 'https://api.test';

test('builds the URL and a JSON body, and sends no Cookie without a session', async () => {
  const { calls, fetchImpl } = fakeFetch(200, { ok: true });
  const api = createClient({ baseUrl, store: memoryStore(), fetchImpl });

  assert.deepEqual(await api.post('/sessions', { day: 'upper_a' }), { ok: true });

  assert.equal(calls[0].url, 'https://api.test/api/sessions');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.body, '{"day":"upper_a"}');
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers['Content-Type'], 'application/json');
  assert.equal(headers.Cookie, undefined);
  assert.equal(calls[0].init.credentials, 'omit');
});

test('a GET has no body and no content type', async () => {
  const { calls, fetchImpl } = fakeFetch(200, []);
  await createClient({ baseUrl, store: memoryStore(), fetchImpl }).get('/sessions');

  assert.equal(calls[0].init.body, undefined);
  assert.equal((calls[0].init.headers as Record<string, string>)['Content-Type'], undefined);
});

test('sends the stored session as the wt_session cookie', async () => {
  const { calls, fetchImpl } = fakeFetch(200, {});
  await createClient({ baseUrl, store: memoryStore('abc123'), fetchImpl }).get('/auth/me');

  assert.equal((calls[0].init.headers as Record<string, string>).Cookie, 'wt_session=abc123');
});

test('stores the session cookie from a response, not other cookies', async () => {
  const store = memoryStore();
  const { fetchImpl } = fakeFetch(
    200,
    {},
    'other=1; Path=/, wt_session=new-id; HttpOnly; Max-Age=2592000; Path=/; SameSite=lax',
  );
  await createClient({ baseUrl, store, fetchImpl }).post('/auth/login', {});

  assert.equal(store.value, 'new-id');
});

test('a deleted cookie clears the stored session', async () => {
  const store = memoryStore('old');
  const { fetchImpl } = fakeFetch(
    204,
    undefined,
    'wt_session=""; expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Path=/; SameSite=lax',
  );

  assert.equal(await createClient({ baseUrl, store, fetchImpl }).post('/auth/logout'), undefined);
  assert.equal(store.value, null);
});

test('a response without the cookie leaves the stored session alone', async () => {
  const store = memoryStore('keep');
  const { fetchImpl } = fakeFetch(200, {}, 'other=1; Path=/');
  await createClient({ baseUrl, store, fetchImpl }).get('/plan');

  assert.equal(store.value, 'keep');
});

test('a 401 outside /auth/ clears the session, calls onUnauthorized and throws ApiError', async () => {
  const store = memoryStore('stale');
  const { fetchImpl } = fakeFetch(401, { detail: 'Not authenticated' });
  let called = 0;
  const api = createClient({ baseUrl, store, fetchImpl, onUnauthorized: () => called++ });

  await assert.rejects(api.get('/sessions'), (err: unknown) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 401);
    assert.equal(err.detail, 'Not authenticated');
    return true;
  });
  assert.equal(store.value, null);
  assert.equal(called, 1);
});

test('a 401 from /auth/ keeps the session and does not call onUnauthorized', async () => {
  const store = memoryStore('keep');
  const { fetchImpl } = fakeFetch(401, { detail: 'Invalid credentials' });
  let called = 0;
  const api = createClient({ baseUrl, store, fetchImpl, onUnauthorized: () => called++ });

  await assert.rejects(api.post('/auth/login', {}), (err: unknown) => err instanceof ApiError && err.status === 401);
  assert.equal(store.value, 'keep');
  assert.equal(called, 0);
});

test('a non-string detail (a 422 list) is not passed on as a message', async () => {
  const { fetchImpl } = fakeFetch(422, { detail: [{ msg: 'bad' }] });

  await assert.rejects(
    createClient({ baseUrl, store: memoryStore(), fetchImpl }).post('/sets', {}),
    (err: unknown) => err instanceof ApiError && err.status === 422 && err.detail === null,
  );
});
