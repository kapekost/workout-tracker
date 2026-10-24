// The active workout: which exercise, which set, and what has been logged. The server is the
// record: a session is created on start, every set is posted as it is logged, and finishing marks
// it completed. Nothing here imports Expo, so the tests run in plain Node.
import { createStore } from 'zustand/vanilla';

import { ApiError } from '../api/client.ts';
import type { Exercise, PlanDay } from '../plan/plan.ts';
import { adjustRest, startRest, type Rest } from './rest.ts';

export type LoggedSet = { exerciseId: string; setNumber: number; reps: number; weightKg: number };

export type Active = { id: number; day: PlanDay; exerciseIndex: number; sets: LoggedSet[] };

export type WorkoutState = {
  active: Active | null;
  busy: boolean;
  error: string | null;
  // The server already has an open workout; resume() picks it up.
  conflict: boolean;
  // Set when a set is logged; the screen counts down to it.
  rest: Rest | null;
  start(day: PlanDay): Promise<void>;
  resume(days: PlanDay[]): Promise<void>;
  logSet(reps: number, weightKg: number): Promise<void>;
  nextExercise(): void;
  skipRest(): void;
  adjustRest(deltaSec: number): void;
  finish(): Promise<void>;
  reset(): void;
};

type Api = {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  patch<T>(path: string, body?: unknown): Promise<T>;
};

type SessionRow = { id: number; workout_day: string; completed: number | boolean };
type SetRow = { exercise_id: string; set_number: number; reps: number; weight_kg: number };

const TRY_AGAIN = 'Something went wrong. Check your connection and try again.';

export const currentExercise = (a: Active): Exercise => a.day.exercises[a.exerciseIndex];

export const setsFor = (a: Active, exerciseId: string) => a.sets.filter((s) => s.exerciseId === exerciseId);

export const nextSetNumber = (a: Active) => setsFor(a, currentExercise(a).id).length + 1;

// What the reps and weight fields hold, as the numbers the API takes. Weight may be left empty for
// a bodyweight exercise.
export function parseSetInput(
  repsText: string,
  weightText: string,
  bodyweight: boolean,
): { reps: number; weightKg: number } | { error: string } {
  const reps = Number(repsText.trim());
  if (!Number.isInteger(reps) || reps < 1) return { error: 'Reps must be a whole number, 1 or more.' };
  const w = weightText.trim().replace(',', '.');
  if (w === '' && bodyweight) return { reps, weightKg: 0 };
  const weightKg = Number(w);
  if (w === '' || !Number.isFinite(weightKg) || weightKg < 0 || weightKg > 1000) {
    return { error: 'Weight must be between 0 and 1000 kg (0 for bodyweight only).' };
  }
  return { reps, weightKg };
}

const message = (err: unknown, fallback?: string) =>
  err instanceof ApiError ? err.detail ?? fallback ?? TRY_AGAIN : TRY_AGAIN;

export function createWorkoutStore(api: Api, now: () => number = Date.now) {
  return createStore<WorkoutState>()((set, get) => {
    // One request at a time, so a double tap cannot log a set twice.
    async function run(work: () => Promise<void>, onError?: (err: unknown) => Partial<WorkoutState>) {
      if (get().busy) return;
      set({ busy: true, error: null });
      try {
        await work();
      } catch (err) {
        set({ error: message(err), ...onError?.(err) });
      } finally {
        set({ busy: false });
      }
    }

    return {
      active: null,
      busy: false,
      error: null,
      conflict: false,
      rest: null,

      start: (day) =>
        run(
          async () => {
            const row = await api.post<SessionRow>('/sessions', { workout_day: day.id });
            set({ active: { id: row.id, day, exerciseIndex: 0, sets: [] }, conflict: false });
          },
          (err) => (err instanceof ApiError && err.status === 409 ? { conflict: true } : {}),
        ),

      resume: (days) =>
        run(async () => {
          const open = (await api.get<SessionRow[]>('/sessions')).find((s) => !s.completed);
          if (!open) {
            set({ conflict: false, error: 'There is no workout in progress.' });
            return;
          }
          const day = days.find((d) => d.id === open.workout_day);
          if (!day) {
            set({ error: "That workout's day is no longer in your plan." });
            return;
          }
          const detail = await api.get<SessionRow & { sets: SetRow[] }>(`/sessions/${open.id}`);
          const sets = detail.sets.map((s) => ({
            exerciseId: s.exercise_id,
            setNumber: s.set_number,
            reps: s.reps,
            weightKg: s.weight_kg,
          }));
          const last = sets.at(-1);
          const index = last ? Math.max(0, day.exercises.findIndex((e) => e.id === last.exerciseId)) : 0;
          set({ active: { id: open.id, day, exerciseIndex: index, sets }, conflict: false });
        }),

      logSet: (reps, weightKg) =>
        run(async () => {
          const { active } = get();
          if (!active) return;
          const exercise = currentExercise(active);
          const setNumber = nextSetNumber(active);
          await api.post(`/sessions/${active.id}/sets`, {
            exercise_id: exercise.id,
            exercise_name: exercise.name,
            set_number: setNumber,
            reps,
            weight_kg: weightKg,
            // Fixed for this set, so a retry after a lost response returns the stored set.
            client_id: `${active.id}:${exercise.id}:${setNumber}`,
          });
          set({
            active: { ...active, sets: [...active.sets, { exerciseId: exercise.id, setNumber, reps, weightKg }] },
            rest: startRest(now()),
          });
        }),

      nextExercise() {
        const { active } = get();
        if (active && active.exerciseIndex < active.day.exercises.length - 1) {
          set({ active: { ...active, exerciseIndex: active.exerciseIndex + 1 } });
        }
      },

      skipRest: () => set({ rest: null }),

      adjustRest(deltaSec) {
        const { rest } = get();
        if (rest) set({ rest: adjustRest(rest, deltaSec, now()) });
      },

      finish: () =>
        run(async () => {
          const { active } = get();
          if (!active) return;
          await api.patch(`/sessions/${active.id}`, { completed: true });
          set({ active: null, rest: null });
        }),

      reset: () => set({ active: null, busy: false, error: null, conflict: false, rest: null }),
    };
  });
}
