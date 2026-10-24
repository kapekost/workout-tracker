import assert from 'node:assert/strict';
import { test } from 'node:test';

import { exerciseById } from './muscles.ts';
import { FIXTURE } from './fixture.ts';
import {
  REF_SETS,
  bandFor,
  daysBetweenDates,
  dayLabel,
  groupRecovery,
  hoursSince,
  localToday,
  noveltyFor,
  type RecencyRow,
} from './recovery.ts';

const BY_ID = exerciseById(FIXTURE.plan);
const AT = '2026-08-12 18:00:00';
const AT_MS = Date.parse('2026-08-12T18:00:00Z');
const H = 3600_000;

const row = (over: Partial<RecencyRow> = {}): RecencyRow => ({
  exercise_id: 'back_squat',
  last_date: '2026-08-12',
  last_at: AT,
  sets: 3,
  prev_date: '2026-08-08',
  ...over,
});

const lowerADay = [row({ exercise_id: 'back_squat' }), row({ exercise_id: 'leg_press' })];
const quads = (rows: RecencyRow[], nowMs: number) => groupRecovery(rows, nowMs, BY_ID).find((g) => g.id === 'quads')!;

test('reads Recently trained at 0h', () => {
  const g = quads(lowerADay, AT_MS);
  assert.ok(Math.abs(g.freshness! - 0) < 1e-5);
  assert.equal(g.band, 'Recently trained');
});

test('reads Partly recovered at 24h', () => {
  const g = quads(lowerADay, AT_MS + 24 * H);
  assert.ok(Math.abs(g.freshness! - 0.632) < 0.005);
  assert.equal(g.band, 'Partly recovered (est.)');
});

test('reads Fresh at 48h', () => {
  const g = quads(lowerADay, AT_MS + 48 * H);
  assert.ok(Math.abs(g.freshness! - 0.865) < 0.005);
  assert.equal(g.band, 'Fresh');
});

test('applies the 1.5x novelty factor', () => {
  const novel = lowerADay.map((r) => ({ ...r, prev_date: null }));
  assert.ok(Math.abs(quads(novel, AT_MS + 24 * H).freshness! - 0.448) < 0.005);
  assert.ok(Math.abs(quads(novel, AT_MS + 48 * H).freshness! - 0.797) < 0.005);
});

test('novelty is 1.5 with no previous session or at 28 days, 1.0 at 27', () => {
  assert.equal(noveltyFor(row({ prev_date: null })), 1.5);
  assert.equal(noveltyFor(row({ last_date: '2026-08-12', prev_date: '2026-07-15' })), 1.5);
  assert.equal(noveltyFor(row({ last_date: '2026-08-12', prev_date: '2026-07-16' })), 1.0);
});

test('caps at 1.0 so freshness never goes negative', () => {
  const heavy = [row({ sets: 40 }), row({ exercise_id: 'leg_press', sets: 40 })];
  assert.equal(quads(heavy, AT_MS).freshness, 0);
});

test('caps each bout before decay, not the summed group total', () => {
  const g = quads([row({ sets: 20 })], AT_MS + 48 * H);
  assert.ok(Math.abs(g.freshness! - 0.8647) < 0.0001);
  assert.equal(g.band, 'Fresh');
});

test('bandFor boundaries', () => {
  assert.equal(bandFor(0.75), 'Fresh');
  assert.equal(bandFor(0.7499), 'Partly recovered (est.)');
  assert.equal(bandFor(0.35), 'Partly recovered (est.)');
  assert.equal(bandFor(0.3499), 'Recently trained');
  assert.equal(bandFor(null), 'Not trained yet');
});

test('reads Not trained yet, not Fresh', () => {
  const groups = groupRecovery([], AT_MS, BY_ID);
  assert.equal(groups.length, 7);
  const g = groups.find((x) => x.id === 'chest')!;
  assert.equal(g.band, 'Not trained yet');
  assert.equal(g.daysSince, null);
  assert.equal(g.hoursSince, null);
  assert.equal(g.daysSinceLabel, 'Not trained yet');
});

test('counts an indirect contribution as training', () => {
  const g = groupRecovery([row({ exercise_id: 'bench_press' })], AT_MS, BY_ID).find((x) => x.id === 'arms')!;
  assert.notEqual(g.band, 'Not trained yet');
  assert.equal(g.fractionalSets, 1.5);
});

test('ignores a row for an exercise the plan no longer has', () => {
  const g = groupRecovery([row({ exercise_id: 'gone' })], AT_MS, BY_ID);
  assert.ok(g.every((x) => x.freshness === null));
});

test('parses logged_at as UTC', () => {
  assert.ok(Math.abs(hoursSince('2026-08-12 18:00:00', Date.parse('2026-08-12T21:00:00Z')) - 3) < 1e-6);
});

test('clamps a future timestamp to 0', () => {
  assert.equal(hoursSince(AT, AT_MS - 5 * H), 0);
  assert.equal(quads(lowerADay, AT_MS - 5 * H).freshness, 0);
});

test('counts days by calendar', () => {
  const yesterday = new Date(2026, 7, 11, 22, 0, 0);
  const today = new Date(2026, 7, 12, 8, 0, 0);
  assert.equal(dayLabel(localToday(yesterday), localToday(today)), 'Yesterday');
  assert.equal(dayLabel('2026-08-12', '2026-08-12'), 'Today');
  assert.equal(dayLabel('2026-08-09', '2026-08-12'), '3 days ago');
  assert.equal(daysBetweenDates('2026-08-09', '2026-08-12'), 3);
});

test('computes localToday in the local frame', () => {
  assert.equal(localToday(new Date(2026, 7, 12, 0, 30, 0)), '2026-08-12');
});

test('uses ref = 6 fractional sets', () => {
  assert.equal(REF_SETS, 6);
});
