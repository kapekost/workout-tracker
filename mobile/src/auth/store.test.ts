import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ApiError } from '../api/client.ts';
import { createAuthStore, type Profile } from './store.ts';

const me: Profile = { id: 1, username: 'kapekost', role: 'admin', icon: null, email: null };

function setup(handlers: { get?: () => Promise<unknown>; post?: (path: string) => Promise<unknown> }) {
  const posts: string[] = [];
  let cleared = 0;
  const store = createAuthStore({
    api: {
      get: (async () => handlers.get?.()) as never,
      post: (async (path: string) => {
        posts.push(path);
        return handlers.post?.(path);
      }) as never,
    },
    clearSession: async () => {
      cleared++;
    },
  });
  return { store, posts, cleared: () => cleared };
}

const unauthorized = () => new ApiError('API GET /auth/me -> 401', 401, 'Not authenticated');

test('starts loading', () => {
  assert.equal(setup({}).store.getState().status, 'loading');
});

test('restore with a live session signs in with the profile', async () => {
  const { store } = setup({ get: async () => me });
  await store.getState().restore();

  assert.equal(store.getState().status, 'signedIn');
  assert.deepEqual(store.getState().profile, me);
});

test('restore with a dead session shows Login without an error', async () => {
  const { store } = setup({ get: async () => Promise.reject(unauthorized()) });
  await store.getState().restore();

  assert.equal(store.getState().status, 'signedOut');
  assert.equal(store.getState().error, null);
});

test('restore without a network shows Login with the reason and does not clear the session', async () => {
  const { store, cleared } = setup({ get: async () => Promise.reject(new TypeError('Network request failed')) });
  await store.getState().restore();

  assert.equal(store.getState().status, 'signedOut');
  assert.equal(store.getState().error, 'Cannot reach the server');
  assert.equal(cleared(), 0);
});

test('login posts the credentials and signs in', async () => {
  const { store, posts } = setup({ post: async () => me });
  await store.getState().login('kapekost', 'correct horse battery');

  assert.deepEqual(posts, ['/auth/login']);
  assert.equal(store.getState().status, 'signedIn');
  assert.equal(store.getState().profile?.username, 'kapekost');
});

test('bad credentials show the server message and stay logged out', async () => {
  const { store } = setup({
    get: async () => Promise.reject(unauthorized()),
    post: async () => Promise.reject(new ApiError('API POST /auth/login -> 401', 401, 'invalid username or password')),
  });
  await store.getState().restore();
  await store.getState().login('kapekost', 'wrong');

  assert.equal(store.getState().status, 'signedOut');
  assert.equal(store.getState().error, 'invalid username or password');
});

test('a login with no readable message says so, and a dead network says that', async () => {
  const noDetail = setup({ post: async () => Promise.reject(new ApiError('API POST /auth/login -> 500', 500, null)) });
  await noDetail.store.getState().login('a', 'b');
  assert.equal(noDetail.store.getState().error, 'Could not log in');

  const offline = setup({ post: async () => Promise.reject(new TypeError('Network request failed')) });
  await offline.store.getState().login('a', 'b');
  assert.equal(offline.store.getState().error, 'Cannot reach the server');
});

test('a new login attempt clears the previous error', async () => {
  let fail = true;
  const { store } = setup({
    post: async () => (fail ? Promise.reject(new ApiError('x', 401, 'invalid username or password')) : me),
  });
  await store.getState().login('a', 'b');
  fail = false;
  await store.getState().login('a', 'b');

  assert.equal(store.getState().error, null);
  assert.equal(store.getState().status, 'signedIn');
});

test('logout posts, clears the stored credential and signs out', async () => {
  const { store, posts, cleared } = setup({ get: async () => me, post: async () => undefined });
  await store.getState().restore();
  await store.getState().logout();

  assert.deepEqual(posts, ['/auth/logout']);
  assert.equal(cleared(), 1);
  assert.equal(store.getState().status, 'signedOut');
  assert.equal(store.getState().profile, null);
});

test('logout still clears the credential and signs out when the request fails', async () => {
  const { store, cleared } = setup({
    get: async () => me,
    post: async () => Promise.reject(new TypeError('Network request failed')),
  });
  await store.getState().restore();
  await store.getState().logout();

  assert.equal(cleared(), 1);
  assert.equal(store.getState().status, 'signedOut');
});

test('a session the server ended signs the user out', async () => {
  const { store } = setup({ get: async () => me });
  await store.getState().restore();
  store.getState().signedOut();

  assert.equal(store.getState().status, 'signedOut');
  assert.equal(store.getState().profile, null);
});
