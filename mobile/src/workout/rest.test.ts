import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_REST_SEC, adjustRest, formatClock, remainingSeconds, startRest } from './rest.ts';

test('a rest defaults to 90 seconds and counts down from its end time', () => {
  const rest = startRest(1_000_000);

  assert.equal(DEFAULT_REST_SEC, 90);
  assert.equal(remainingSeconds(rest, 1_000_000), 90);
  assert.equal(remainingSeconds(rest, 1_000_000 + 30_000), 60);
});

test('time spent with the app in the background still counts: only the clock matters', () => {
  const rest = startRest(0, 90);

  assert.equal(remainingSeconds(rest, 75_000), 15);
  assert.equal(remainingSeconds(rest, 5 * 60_000), 0);
});

test('a part second rounds up, so the clock never shows 0:00 before the rest is over', () => {
  assert.equal(remainingSeconds(startRest(0, 10), 9_500), 1);
});

test('adjusting moves the end; cutting it to nothing ends the rest', () => {
  const rest = startRest(0, 60);

  assert.equal(remainingSeconds(adjustRest(rest, 30, 10_000)!, 10_000), 80);
  assert.equal(remainingSeconds(adjustRest(rest, -30, 10_000)!, 10_000), 20);
  assert.equal(adjustRest(rest, -60, 10_000), null);
  assert.equal(adjustRest(rest, -90, 10_000), null);
});

test('the clock reads minutes and padded seconds', () => {
  assert.equal(formatClock(90), '1:30');
  assert.equal(formatClock(5), '0:05');
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(-3), '0:00');
});
