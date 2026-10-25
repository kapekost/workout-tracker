// The mobile app's own API client and stores against the real backend, so a change on either
// side that the screen tests' fake API would not notice fails here. Skipped unless a server is
// named: CI starts one on a throwaway database (see .github/workflows/mobile-contract.yml), and
// scripts/mobile_drive.sh starts one locally.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ApiError, createClient, type SessionStore } from '../api/client.ts';
import { createAuthStore, type Profile } from '../auth/store.ts';
import { planDays, type Plan } from '../plan/plan.ts';
import { createWorkoutStore } from '../workout/session.ts';

const baseUrl = process.env.CONTRACT_API_URL;
const password = process.env.CONTRACT_PASSWORD ?? '';
const skip = baseUrl ? false : 'set CONTRACT_API_URL and CONTRACT_PASSWORD (see mobile/AGENTS.md)';

function memoryStore() {
  const store = {
    value: null as string | null,
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

function app() {
  const store = memoryStore();
  const unauthorized: string[] = [];
  const api = createClient({ baseUrl: baseUrl!, store, onUnauthorized: () => unauthorized.push('401') });
  const auth = createAuthStore({ api, clearSession: store.clear });
  return { api, store, auth, unauthorized };
}

type SessionDetail = {
  id: number;
  completed: number | boolean;
  sets: { exercise_id: string; set_number: number; reps: number; weight_kg: number }[];
};

test('mobile client against the real backend', { skip }, async (t) => {
  const { api, store, auth, unauthorized } = app();
  let plan: Plan;

  await t.test('a wrong password is a 401 with the server message, and stays signed out', async () => {
    await assert.rejects(
      api.post('/auth/login', { username: 'kapekost', password: 'not the password' }),
      (err) => err instanceof ApiError && err.status === 401 && typeof err.detail === 'string',
    );
    await auth.getState().login('kapekost', 'not the password');
    assert.notEqual(auth.getState().status, 'signedIn');
    assert.ok(auth.getState().error);
    assert.equal(store.value, null);
  });

  await t.test('login keeps the session cookie from Set-Cookie and /auth/me accepts it', async () => {
    await auth.getState().login('kapekost', password);
    assert.equal(auth.getState().status, 'signedIn');
    assert.equal(auth.getState().profile?.username, 'kapekost');
    assert.ok(store.value, 'the session cookie was not read from Set-Cookie');
    const me = await api.get<Profile>('/auth/me');
    assert.equal(me.id, auth.getState().profile?.id);
  });

  await t.test('the plan has the shape the screens read', async () => {
    plan = await api.get<Plan>('/plan');
    assert.ok(plan.cycle.length > 0);
    for (const key of plan.cycle) assert.ok(plan.plan[key], `cycle names a day the plan lacks: ${key}`);
    for (const day of planDays(plan)) {
      assert.ok(day.exercises.length > 0);
      for (const e of day.exercises) {
        assert.equal(typeof e.id, 'string');
        assert.equal(typeof e.name, 'string');
        assert.ok(Number.isInteger(e.sets) && e.repsLow <= e.repsHigh);
      }
    }
  });

  await t.test('start, log two sets, retry one, finish', async () => {
    const workout = createWorkoutStore(api);
    await workout.getState().start(planDays(plan)[0]);
    const active = workout.getState().active;
    assert.ok(active, `start failed: ${workout.getState().error}`);

    await workout.getState().logSet(8, 60);
    await workout.getState().logSet(8, 62.5);
    assert.equal(workout.getState().error, null);

    // A lost response makes the app send the same set again; the key is fixed per set.
    const exerciseId = active.day.exercises[0].id;
    const again = await api.post<{ id: number }>(`/sessions/${active.id}/sets`, {
      exercise_id: exerciseId,
      exercise_name: active.day.exercises[0].name,
      set_number: 1,
      reps: 8,
      weight_kg: 60,
      client_id: `${active.id}:${exerciseId}:1`,
    });
    assert.ok(again.id);

    const detail = await api.get<SessionDetail>(`/sessions/${active.id}`);
    assert.deepEqual(
      detail.sets.map((s) => [s.set_number, s.reps, s.weight_kg]),
      [[1, 8, 60], [2, 8, 62.5]],
    );

    await workout.getState().finish();
    assert.equal(workout.getState().error, null);
    assert.ok((await api.get<SessionDetail>(`/sessions/${active.id}`)).completed);
  });

  await t.test('a second start while one is open is a 409 the store reports as a conflict', async () => {
    const first = createWorkoutStore(api);
    const second = createWorkoutStore(api);
    const day = planDays(plan)[0];
    await first.getState().start(day);
    assert.ok(first.getState().active, `start failed: ${first.getState().error}`);
    await second.getState().start(day);
    assert.equal(second.getState().conflict, true);
    assert.equal(second.getState().active, null);
    await first.getState().finish();
  });

  await t.test('without a session a data request is a 401 and the app is told', async () => {
    const stranger = app();
    await assert.rejects(stranger.api.get('/sessions'), (err) => err instanceof ApiError && err.status === 401);
    assert.equal(stranger.unauthorized.length, 1);
  });

  await t.test('logout clears the stored cookie and ends the session on the server', async () => {
    const oldCookie = store.value;
    assert.ok(oldCookie);
    await auth.getState().logout();
    assert.equal(auth.getState().status, 'signedOut');
    assert.equal(store.value, null);
    assert.equal(unauthorized.length, 0);
    // The old cookie, sent by hand, must no longer be a session.
    const replay = memoryStore();
    replay.value = oldCookie;
    await assert.rejects(
      createClient({ baseUrl: baseUrl!, store: replay }).get('/auth/me'),
      (err) => err instanceof ApiError && err.status === 401,
    );
  });
});
