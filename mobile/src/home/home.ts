// What the Home screen derives from GET /sessions. Port of the helpers in frontend/src/pages/Home.jsx.
// Nothing here imports Expo, so the tests run in plain Node.
import type { Plan, PlanDay } from '../plan/plan.ts';
import { dayLabel, daysBetweenDates, localToday, parseUtc } from '../recovery/recovery.ts';

// A row of GET /sessions. The list is newest first by created_at and capped at 60 rows by the
// server; do not re-sort it here. `date` is server-local, `created_at` is UTC with no zone suffix.
export type SessionRow = {
  id: number;
  workout_day: string;
  date: string;
  completed: number | boolean;
  created_at: string;
};

// The day after the most recent session in the cycle. Only the latest session counts, completed or
// not, and a latest day outside the cycle (or no sessions at all) restarts at the first day.
export function nextWorkoutId(sessions: SessionRow[], cycle: string[]): string | undefined {
  const i = cycle.indexOf(sessions[0]?.workout_day);
  return i === -1 ? cycle[0] : cycle[(i + 1) % cycle.length];
}

// The server list decides Resume versus Start, not any local state: a wrong Start orphans the open
// workout.
export function openSession(sessions: SessionRow[] | null | undefined): SessionRow | null {
  return Array.isArray(sessions) ? (sessions.find((s) => !s.completed) ?? null) : null;
}

// Completed sessions in the last 7 days.
export function weekSessionCount(sessions: SessionRow[], todayIso: string): number {
  return sessions.filter((s) => {
    if (!s.completed) return false;
    const d = daysBetweenDates(s.date, todayIso);
    return d >= 0 && d < 7;
  }).length;
}

// Completed sessions only, matching /exercises/recency: an in-progress session must not read as
// "Last workout today".
export function lastWorkoutLabel(sessions: SessionRow[] | null | undefined, nowMs: number = Date.now()): string {
  const done = (sessions || []).filter((s) => s.completed);
  if (!done.length) return 'No workouts logged yet';
  const latest = done.reduce((a, b) => (b.date > a.date ? b : a));
  return `Last workout ${dayLabel(latest.date, localToday(new Date(nowMs))).toLowerCase()}`;
}

// Most recent COMPLETED session date per plan day. Feeds bestDayForMuscle's tie-break from the
// /sessions response Home already has.
export function lastTrainedByDay(sessions: SessionRow[], cycle: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of sessions) {
    if (!s.completed || !cycle.includes(s.workout_day)) continue;
    if (!out[s.workout_day] || s.date > out[s.workout_day]) out[s.workout_day] = s.date;
  }
  return out;
}

// "42 min" under an hour, "1 h 05 min" after. A label, not a clock; a future timestamp reads 0.
export function elapsedLabel(createdAt: string, nowMs: number): string {
  const minutes = Math.max(0, Math.floor((nowMs - parseUtc(createdAt)) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

// The day the header shows: the open workout's, else the next one. A day that left the plan after an
// edit gets a placeholder rather than a crash.
export function displayDay(active: SessionRow | null, nextId: string | undefined, plan: Plan['plan']): PlanDay {
  const id = active?.workout_day ?? nextId ?? '';
  return plan[id] ?? { id, name: 'Workout', tag: null, icon: null, exercises: [] };
}
