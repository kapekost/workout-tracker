import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FIXTURE } from '../recovery/fixture.ts';
import {
  displayDay,
  elapsedLabel,
  lastTrainedByDay,
  lastWorkoutLabel,
  nextWorkoutId,
  openSession,
  weekSessionCount,
  type SessionRow,
} from './home.ts';

const CYCLE = ['upper_a', 'lower_a', 'upper_b', 'lower_b'];
let n = 0;
const session = (over: Partial<SessionRow> = {}): SessionRow => ({
  id: ++n,
  workout_day: 'upper_a',
  date: '2026-08-12',
  completed: 1,
  created_at: '2026-08-12 18:00:00',
  ...over,
});

test('starts at the first day with no sessions', () => {
  assert.equal(nextWorkoutId([], CYCLE), 'upper_a');
});

test('takes the day after the latest session, completed or not', () => {
  assert.equal(nextWorkoutId([session({ workout_day: 'lower_a', completed: 0 }), session()], CYCLE), 'upper_b');
});

test('restarts at the first day when the latest day is not in the cycle', () => {
  assert.equal(nextWorkoutId([session({ workout_day: 'gone' })], CYCLE), 'upper_a');
});

test('wraps from the last day to the first', () => {
  assert.equal(nextWorkoutId([session({ workout_day: 'lower_b' })], CYCLE), 'upper_a');
});

test('is undefined for an empty cycle', () => {
  assert.equal(nextWorkoutId([session()], []), undefined);
});

test('finds the first session that is not completed', () => {
  const open = session({ completed: 0 });
  assert.equal(openSession([session(), open, session({ completed: 0 })]), open);
});

test('is null when no session is open or the list is not an array', () => {
  assert.equal(openSession([session()]), null);
  assert.equal(openSession(null), null);
  assert.equal(openSession(undefined), null);
});

test('counts completed sessions in the last 7 days only', () => {
  const sessions = [
    session({ date: '2026-08-12' }),
    session({ date: '2026-08-06' }),
    session({ date: '2026-08-05' }),
    session({ date: '2026-08-12', completed: 0 }),
    session({ date: '2026-08-13' }),
  ];
  assert.equal(weekSessionCount(sessions, '2026-08-12'), 2);
});

const NOW = new Date(2026, 7, 12, 12).getTime();

test('reports the empty state', () => {
  assert.equal(lastWorkoutLabel([], NOW), 'No workouts logged yet');
  assert.equal(lastWorkoutLabel(null, NOW), 'No workouts logged yet');
});

test('ignores in-progress sessions in the last workout line', () => {
  const sessions = [session({ date: '2026-08-12', completed: 0 }), session({ date: '2026-08-09' })];
  assert.equal(lastWorkoutLabel(sessions, NOW), 'Last workout 3 days ago');
});

test('says Today and Yesterday rather than a day count', () => {
  assert.equal(lastWorkoutLabel([session({ date: '2026-08-12' })], NOW), 'Last workout today');
  assert.equal(lastWorkoutLabel([session({ date: '2026-08-11' })], NOW), 'Last workout yesterday');
});

test('maps each plan day to its latest completed date', () => {
  const sessions = [
    session({ workout_day: 'upper_a', date: '2026-08-12' }),
    session({ workout_day: 'upper_a', date: '2026-08-01' }),
    session({ workout_day: 'lower_a', date: '2026-08-05' }),
  ];
  assert.deepEqual(lastTrainedByDay(sessions, CYCLE), { upper_a: '2026-08-12', lower_a: '2026-08-05' });
});

test('lastTrainedByDay ignores in-progress sessions and days outside the cycle', () => {
  const sessions = [session({ completed: 0, date: '2026-08-12' }), session({ workout_day: 'gone' })];
  assert.deepEqual(lastTrainedByDay(sessions, CYCLE), {});
});

const created = '2026-08-12 18:00:00';
const at = (minutes: number) => Date.parse('2026-08-12T18:00:00Z') + minutes * 60_000;

test('reads minutes under an hour', () => {
  assert.equal(elapsedLabel(created, at(42)), '42 min');
  assert.equal(elapsedLabel(created, at(0)), '0 min');
});

test('reads hours and zero-padded minutes', () => {
  assert.equal(elapsedLabel(created, at(65)), '1 h 05 min');
  assert.equal(elapsedLabel(created, at(120)), '2 h 00 min');
});

test('clamps a future timestamp to 0 min', () => {
  assert.equal(elapsedLabel(created, at(-30)), '0 min');
});

test('parses the zone-less UTC string as UTC', () => {
  // Read as local time this would be off by the zone offset.
  assert.equal(elapsedLabel('2026-08-12 18:00:00', Date.parse('2026-08-12T18:10:00Z')), '10 min');
});

test('shows the open workout day when one exists', () => {
  const day = displayDay(session({ workout_day: 'lower_a', completed: 0 }), 'upper_a', FIXTURE.plan);
  assert.equal(day.id, 'lower_a');
});

test('shows the next day when nothing is open', () => {
  assert.equal(displayDay(null, 'upper_b', FIXTURE.plan).id, 'upper_b');
});

test('falls back to a Workout placeholder for a day that left the plan', () => {
  const day = displayDay(session({ workout_day: 'gone', completed: 0 }), 'upper_a', FIXTURE.plan);
  assert.equal(day.id, 'gone');
  assert.equal(day.name, 'Workout');
  assert.deepEqual(day.exercises, []);
});
