import assert from 'node:assert/strict';
import { test } from 'node:test';

import { routeGroup } from './guard.ts';

test('a stored session that is still being checked belongs to no group', () => {
  assert.equal(routeGroup('loading'), 'loading');
});

test('a logged-out user is in the auth group only', () => {
  assert.equal(routeGroup('signedOut'), 'auth');
});

test('a logged-in user is in the app group only', () => {
  assert.equal(routeGroup('signedIn'), 'app');
});
