import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ApiError } from '../api/client.ts';
import type { Exercise, PlanDay } from '../plan/plan.ts';
import { createWorkoutStore, currentExercise, nextSetNumber, parseSetInput } from './session.ts';

const ex = (id: string, over: Partial<Exercise> = {}): Exercise => ({
  id,
  name: id.toUpperCase(),
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
const day: PlanDay = { id: 'upper_a', name: 'Upper A', tag: null, icon: null, exercises: [ex('bench'), ex('row')] };

type Call = { method: string; path: string; body?: unknown };

function setup(respond: (c: Call) => unknown = () => ({ id: 7 }), now: () => number = () => 1_000_000) {
  const calls: Call[] = [];
  const handle = async (method: string, path: string, body?: unknown) => {
    const call = { method, path, body };
    calls.push(call);
    const out = respond(call);
    if (out instanceof Error) throw out;
    return out;
  };
  const store = createWorkoutStore({
    get: (async (p: string) => handle('GET', p)) as never,
    post: (async (p: string, b?: unknown) => handle('POST', p, b)) as never,
    patch: (async (p: string, b?: unknown) => handle('PATCH', p, b)) as never,
  }, now);
  return { store, calls };
}

const s = (store: ReturnType<typeof setup>['store']) => store.getState();

test('start creates the session on the server and makes the first exercise current', async () => {
  const { store, calls } = setup();
  await s(store).start(day);

  assert.deepEqual(calls, [{ method: 'POST', path: '/sessions', body: { workout_day: 'upper_a' } }]);
  assert.equal(s(store).active?.id, 7);
  assert.equal(currentExercise(s(store).active!).id, 'bench');
});

test('start while the server has an open workout reports the conflict and offers resume', async () => {
  const { store } = setup(() => new ApiError('x', 409, 'a workout is already in progress'));
  await s(store).start(day);

  assert.equal(s(store).active, null);
  assert.equal(s(store).conflict, true);
  assert.equal(s(store).error, 'a workout is already in progress');
});

test('logSet posts the set with a client id fixed per set, then moves to the next set number', async () => {
  const { store, calls } = setup();
  await s(store).start(day);
  await s(store).logSet(8, 60);

  assert.deepEqual(calls[1], {
    method: 'POST',
    path: '/sessions/7/sets',
    body: { exercise_id: 'bench', exercise_name: 'BENCH', set_number: 1, reps: 8, weight_kg: 60, client_id: '7:bench:1' },
  });
  assert.equal(nextSetNumber(s(store).active!), 2);
  assert.deepEqual(s(store).active?.sets, [{ exerciseId: 'bench', setNumber: 1, reps: 8, weightKg: 60 }]);
});

test('a failed logSet keeps state and a retry sends the same client id', async () => {
  let fail = true;
  const { store, calls } = setup((c) => (c.path.endsWith('/sets') && fail ? new TypeError('Network request failed') : { id: 7 }));
  await s(store).start(day);
  await s(store).logSet(8, 60);

  assert.equal(s(store).active?.sets.length, 0);
  assert.match(s(store).error ?? '', /Check your connection/);

  fail = false;
  await s(store).logSet(8, 60);
  const ids = calls.filter((c) => c.path.endsWith('/sets')).map((c) => (c.body as { client_id: string }).client_id);
  assert.deepEqual(ids, ['7:bench:1', '7:bench:1']);
  assert.equal(s(store).active?.sets.length, 1);
  assert.equal(s(store).error, null);
});

test('a second action while one is in flight is ignored, so a double tap logs once', async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  const posts: string[] = [];
  const store = createWorkoutStore({
    get: (async () => []) as never,
    patch: (async () => ({})) as never,
    post: (async (p: string) => {
      posts.push(p);
      if (p.endsWith('/sets')) await gate;
      return { id: 7 };
    }) as never,
  });
  await store.getState().start(day);
  const first = store.getState().logSet(8, 60);
  await store.getState().logSet(8, 60);
  release();
  await first;

  assert.equal(posts.filter((p) => p.endsWith('/sets')).length, 1);
  assert.equal(store.getState().active?.sets.length, 1);
});

test('nextExercise advances and stops at the last exercise; set numbers restart per exercise', async () => {
  const { store } = setup();
  await s(store).start(day);
  await s(store).logSet(8, 60);
  s(store).nextExercise();

  assert.equal(currentExercise(s(store).active!).id, 'row');
  assert.equal(nextSetNumber(s(store).active!), 1);
  s(store).nextExercise();
  assert.equal(s(store).active?.exerciseIndex, 1);
});

test('finish marks the session completed and clears the active workout', async () => {
  const { store, calls } = setup();
  await s(store).start(day);
  await s(store).finish();

  assert.deepEqual(calls.at(-1), { method: 'PATCH', path: '/sessions/7', body: { completed: true } });
  assert.equal(s(store).active, null);
});

test('a failed finish keeps the workout so it can be retried', async () => {
  const { store } = setup((c) => (c.method === 'PATCH' ? new TypeError('Network request failed') : { id: 7 }));
  await s(store).start(day);
  await s(store).finish();

  assert.equal(s(store).active?.id, 7);
  assert.match(s(store).error ?? '', /Check your connection/);
});

test('resume picks up the open workout with its logged sets and the exercise it was on', async () => {
  const { store } = setup((c) => {
    if (c.path === '/sessions') return [{ id: 3, workout_day: 'upper_a', completed: 1 }, { id: 9, workout_day: 'upper_a', completed: 0 }];
    return { id: 9, workout_day: 'upper_a', completed: 0, sets: [
      { exercise_id: 'bench', set_number: 1, reps: 8, weight_kg: 60 },
      { exercise_id: 'row', set_number: 1, reps: 10, weight_kg: 50 },
    ] };
  });
  await s(store).resume([day]);

  assert.equal(s(store).active?.id, 9);
  assert.equal(s(store).active?.exerciseIndex, 1);
  assert.equal(s(store).active?.sets.length, 2);
  assert.equal(s(store).conflict, false);
});

test('resume says so when there is no open workout or its day left the plan', async () => {
  const none = setup(() => [{ id: 3, workout_day: 'upper_a', completed: 1 }]);
  await s(none.store).resume([day]);
  assert.equal(s(none.store).error, 'There is no workout in progress.');

  const gone = setup(() => [{ id: 4, workout_day: 'removed_day', completed: 0 }]);
  await s(gone.store).resume([day]);
  assert.equal(s(gone.store).active, null);
  assert.match(s(gone.store).error ?? '', /no longer in your plan/);
});

test('reset drops an open workout, as when the user logs out', async () => {
  const { store } = setup();
  await s(store).start(day);
  s(store).reset();

  assert.equal(s(store).active, null);
});

test('set input: whole reps of 1 or more, weight 0 to 1000 with a comma accepted', () => {
  assert.deepEqual(parseSetInput('8', '62,5', false), { reps: 8, weightKg: 62.5 });
  assert.deepEqual(parseSetInput(' 10 ', '0', false), { reps: 10, weightKg: 0 });
  for (const reps of ['', '0', '-1', '2.5', 'abc']) assert.ok('error' in parseSetInput(reps, '10', false), reps);
  for (const w of ['-5', '1001', 'abc', '']) assert.ok('error' in parseSetInput('8', w, false), w);
});

test('an empty weight is allowed for a bodyweight exercise only', () => {
  assert.deepEqual(parseSetInput('12', '', true), { reps: 12, weightKg: 0 });
  assert.ok('error' in parseSetInput('12', '', false));
});

test('logging a set starts a 90 second rest from the clock', async () => {
  const { store } = setup(undefined, () => 5_000);
  await s(store).start(day);
  assert.equal(s(store).rest, null);
  await s(store).logSet(8, 60);

  assert.deepEqual(s(store).rest, { endsAtMs: 5_000 + 90_000 });
});

test('a set that failed to save starts no rest', async () => {
  const { store } = setup((c) => (c.path.endsWith('/sets') ? new TypeError('Network request failed') : { id: 7 }));
  await s(store).start(day);
  await s(store).logSet(8, 60);

  assert.equal(s(store).rest, null);
});

test('skip ends the rest, adjust moves it, and the next set restarts it', async () => {
  let t = 0;
  const { store } = setup(undefined, () => t);
  await s(store).start(day);
  await s(store).logSet(8, 60);
  s(store).adjustRest(30);
  assert.equal(s(store).rest?.endsAtMs, 120_000);

  s(store).skipRest();
  assert.equal(s(store).rest, null);
  s(store).adjustRest(30);
  assert.equal(s(store).rest, null);

  t = 200_000;
  await s(store).logSet(8, 60);
  assert.equal(s(store).rest?.endsAtMs, 290_000);
});

test('adjusting a rest down to nothing ends it', async () => {
  const { store } = setup(undefined, () => 0);
  await s(store).start(day);
  await s(store).logSet(8, 60);
  s(store).adjustRest(-30);
  s(store).adjustRest(-30);
  s(store).adjustRest(-30);

  assert.equal(s(store).rest, null);
});

test('finish and reset clear the rest', async () => {
  const { store } = setup();
  await s(store).start(day);
  await s(store).logSet(8, 60);
  await s(store).finish();
  assert.equal(s(store).rest, null);

  await s(store).start(day);
  await s(store).logSet(8, 60);
  s(store).reset();
  assert.equal(s(store).rest, null);
});
