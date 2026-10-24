// A small plan for the recovery tests. The app reads the live plan from the API, so the tests do
// not depend on the seed. Primary muscle first, as the plan does.
import type { Exercise, Plan } from '../plan/plan.ts';

const ex = (id: string, sets: number, muscles: string[]): Exercise => ({
  id,
  name: id,
  alt: null,
  sets,
  repsLow: 6,
  repsHigh: 10,
  bodyweight: false,
  muscles,
  ytUrl: null,
  cues: [],
});

const day = (id: string, exercises: Exercise[]) => ({ id, name: id, tag: null, icon: null, exercises });

export const FIXTURE: Plan = {
  cycle: ['upper_a', 'lower_a', 'upper_b', 'lower_b'],
  plan: {
    upper_a: day('upper_a', [
      ex('bench_press', 3, ['Chest', 'Front Delt', 'Triceps']),
      ex('bent_row', 3, ['Lats', 'Rhomboids', 'Biceps']),
      ex('ohp', 3, ['Front Delt', 'Side Delt', 'Triceps']),
      ex('lat_pulldown', 3, ['Lats', 'Biceps']),
      ex('tricep_pushdown', 2, ['Triceps']),
      ex('db_curl', 2, ['Biceps']),
    ]),
    lower_a: day('lower_a', [
      ex('back_squat', 3, ['Quads', 'Glutes', 'Hamstrings']),
      ex('leg_press', 3, ['Quads', 'Glutes']),
      ex('leg_curl', 3, ['Hamstrings']),
      ex('standing_calf', 3, ['Gastrocnemius']),
    ]),
    upper_b: day('upper_b', [
      ex('incline_press', 3, ['Upper Chest', 'Front Delt', 'Triceps']),
      ex('cable_row', 3, ['Mid Back', 'Rhomboids', 'Lats', 'Biceps']),
      ex('lateral_raise', 3, ['Side Delt']),
      ex('hammer_curl', 3, ['Brachialis']),
    ]),
    lower_b: day('lower_b', [
      ex('rdl', 3, ['Hamstrings', 'Glutes', 'Spinal Erectors']),
      ex('leg_ext', 3, ['Quads']),
      ex('seated_calf', 2, ['Soleus']),
    ]),
  },
};
