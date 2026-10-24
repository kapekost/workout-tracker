import assert from 'node:assert/strict';
import { test } from 'node:test';

import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '../api/client.ts';
import { findExercise, planDays, planQueryOptions, repRange, safeVideoUrl, type Exercise, type Plan } from './plan.ts';

const ex = (id: string, over: Partial<Exercise> = {}): Exercise => ({
  id,
  name: id,
  alt: null,
  sets: 3,
  repsLow: 6,
  repsHigh: 10,
  bodyweight: false,
  muscles: [],
  ytUrl: null,
  cues: [],
  ...over,
});

const data: Plan = {
  plan: {
    lower_a: { id: 'lower_a', name: 'Lower A', tag: null, icon: null, exercises: [ex('squat')] },
    upper_a: { id: 'upper_a', name: 'Upper A', tag: null, icon: null, exercises: [ex('bench'), ex('row')] },
  },
  cycle: ['upper_a', 'lower_a'],
};

test('the plan query fetches /plan with the plan key and returns the data', async () => {
  const paths: string[] = [];
  const api = {
    get: (async (path: string) => {
      paths.push(path);
      return data;
    }) as never,
  };
  const options = planQueryOptions(api);

  assert.deepEqual(options.queryKey, ['plan']);
  assert.deepEqual(await new QueryClient().fetchQuery(options), data);
  assert.deepEqual(paths, ['/plan']);
});

test('a failing plan request rejects with the ApiError so the screen can show its error state', async () => {
  const api = { get: (async () => Promise.reject(new ApiError('x', 500, null))) as never };

  await assert.rejects(
    new QueryClient({ defaultOptions: { queries: { retry: false } } }).fetchQuery(planQueryOptions(api)),
    (err: unknown) => err instanceof ApiError && err.status === 500,
  );
});

test('days come in cycle order, not object order, and a cycle key without a day is skipped', () => {
  assert.deepEqual(planDays(data).map((d) => d.id), ['upper_a', 'lower_a']);
  assert.deepEqual(planDays({ ...data, cycle: ['gone', 'lower_a'] }).map((d) => d.id), ['lower_a']);
});

test('an exercise is found in any day, and an unknown id is undefined', () => {
  assert.equal(findExercise(data, 'row')?.id, 'row');
  assert.equal(findExercise(data, 'squat')?.id, 'squat');
  assert.equal(findExercise(data, 'nope'), undefined);
});

test('a rep range collapses when low and high are equal', () => {
  assert.equal(repRange(ex('a')), '6-10');
  assert.equal(repRange(ex('a', { repsLow: 8, repsHigh: 8 })), '8');
});

test('only an https link is offered as a video', () => {
  assert.equal(safeVideoUrl('https://www.youtube.com/results?search_query=x'), 'https://www.youtube.com/results?search_query=x');
  assert.equal(safeVideoUrl('http://example.com'), null);
  assert.equal(safeVideoUrl('javascript:alert(1)'), null);
  assert.equal(safeVideoUrl(null), null);
});
