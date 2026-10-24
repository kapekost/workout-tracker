import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  EXERCISE_PATTERN,
  MUSCLE_GROUPS,
  PATTERN_TAU,
  allExercises,
  bestDayForMuscle,
  exerciseById,
  groupSetsForDay,
  groupWeightsFor,
  tauFor,
} from './muscles.ts';
import { FIXTURE } from './fixture.ts';

const { plan, cycle } = FIXTURE;
const byId = exerciseById(plan);

test('has 7 display groups', () => {
  assert.equal(MUSCLE_GROUPS.length, 7);
});

test('maps every raw tag in the plan to exactly one group', () => {
  const tags = [...new Set(allExercises(plan).flatMap((e) => e.muscles))];
  for (const tag of tags) {
    assert.equal(MUSCLE_GROUPS.filter((g) => g.tags.includes(tag)).length, 1, tag);
  }
});

test('every pattern names a known tau', () => {
  for (const [id, pattern] of Object.entries(EXERCISE_PATTERN)) {
    assert.ok(pattern in PATTERN_TAU, id);
  }
});

test('weights the primary muscle 1.0 and the rest 0.5', () => {
  assert.deepEqual(groupWeightsFor(byId.bench_press), { chest: 1.0, shoulders: 0.5, arms: 0.5 });
});

test('counts an exercise once per group, at its max weight', () => {
  // Three back tags in one rowing movement are one contribution, not three.
  assert.deepEqual(groupWeightsFor(byId.cable_row), { back: 1.0, arms: 0.5 });
});

test('maps Upper Chest into chest and both calf heads into calves', () => {
  assert.equal(groupWeightsFor(byId.incline_press).chest, 1.0);
  assert.deepEqual(groupWeightsFor(byId.standing_calf), { calves: 1.0 });
  assert.deepEqual(groupWeightsFor(byId.seated_calf), { calves: 1.0 });
});

test('gives an exercise with no muscles no weights', () => {
  assert.deepEqual(groupWeightsFor(undefined), {});
  assert.deepEqual(groupWeightsFor({ ...byId.db_curl, muscles: [] }), {});
});

test('uses 12h for isolation, 18h for multi-joint upper, 24h for multi-joint lower', () => {
  assert.equal(tauFor('db_curl'), 12);
  assert.equal(tauFor('bench_press'), 18);
  assert.equal(tauFor('back_squat'), 24);
});

test('falls back to the longest tau for an unclassified exercise', () => {
  assert.equal(tauFor('some_future_exercise'), 24);
});

test('counts quads in Lower A as 6 fractional sets', () => {
  assert.equal(groupSetsForDay('lower_a', plan).quads, 6);
});

test('accumulates indirect contributions across exercises', () => {
  // Upper A arms: 0.5 x 3 for bench, row, ohp and pulldown, plus 2 pushdowns and 2 curls.
  assert.equal(groupSetsForDay('upper_a', plan).arms, 10);
});

test('returns an empty object for an unknown day', () => {
  assert.deepEqual(groupSetsForDay('bogus_day', plan), {});
});

test('picks the day with the most fractional sets', () => {
  assert.equal(bestDayForMuscle('calves', {}, plan, cycle), 'lower_a');
});

test('breaks the chest tie toward the more rested day', () => {
  assert.equal(bestDayForMuscle('chest', { upper_a: '2026-08-14', upper_b: '2026-08-01' }, plan, cycle), 'upper_b');
  assert.equal(bestDayForMuscle('chest', { upper_a: '2026-08-01', upper_b: '2026-08-14' }, plan, cycle), 'upper_a');
});

test('treats a never-trained day as infinitely rested', () => {
  assert.equal(bestDayForMuscle('chest', { upper_a: '2026-08-14' }, plan, cycle), 'upper_b');
});

test('falls back to cycle order when nothing distinguishes the days', () => {
  assert.equal(bestDayForMuscle('chest', {}, plan, cycle), 'upper_a');
  assert.equal(bestDayForMuscle('chest', { upper_a: '2026-08-10', upper_b: '2026-08-10' }, plan, cycle), 'upper_a');
});

test('returns null for a group no day trains', () => {
  assert.equal(bestDayForMuscle('not_a_group', {}, plan, cycle), null);
});

test('lists an exercise that sits on two days once', () => {
  const squat = byId.back_squat;
  const twice = { a: { ...plan.lower_a, exercises: [squat, byId.leg_press] }, b: { ...plan.lower_a, exercises: [squat] } };
  assert.deepEqual(allExercises(twice).map((e) => e.id), ['back_squat', 'leg_press']);
});

test('indexes an alternative exercise so its sets still count', () => {
  const alt = { ...byId.db_curl, id: 'ez_bar_curl' };
  const withAlt = { d: { ...plan.upper_a, exercises: [{ ...byId.db_curl, altExercise: alt }] } };
  assert.equal(exerciseById(withAlt).ez_bar_curl.id, 'ez_bar_curl');
  assert.equal(exerciseById(withAlt).db_curl.id, 'db_curl');
});
