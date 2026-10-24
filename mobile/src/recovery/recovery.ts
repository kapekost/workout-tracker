// Estimated stimulus decay per muscle group, from training logs alone. Port of
// frontend/src/lib/recovery.js.
//
// This is an ESTIMATE and the UI must always say so. We have elapsed time and logged volume; we do
// not have HRV, sleep or soreness. Nothing here is fitted and there are no per-user parameters,
// because there is no ground truth to fit against.
import type { Exercise } from '../plan/plan.ts';
import { MUSCLE_GROUPS, groupWeightsFor, tauFor } from './muscles.ts';

export const REF_SETS = 6; // fractional sets that make one full stimulus unit
export const NOVELTY_FACTOR = 1.5; // repeated-bout effect
export const NOVELTY_DAYS = 28;
export const BANDS = { fresh: 0.75, partly: 0.35 };

const MS_PER_HOUR = 3600_000;
const MS_PER_DAY = 86400_000;

// One row of GET /exercises/recency.
export type RecencyRow = {
  exercise_id: string;
  last_date: string;
  last_at: string;
  sets: number;
  prev_date: string | null;
};

export type GroupRecovery = {
  id: string;
  label: string;
  freshness: number | null;
  band: string;
  hoursSince: number | null;
  daysSince: number | null;
  daysSinceLabel: string;
  fractionalSets: number;
  lastDate: string | null;
};

// logged_at and created_at are UTC from SQLite's datetime('now') with no zone suffix.
export function parseUtc(ts: string): number {
  return Date.parse(String(ts).replace(' ', 'T') + 'Z');
}

// Clamped at 0: a clock-skewed future timestamp must not produce freshness > 1.
export function hoursSince(ts: string, nowMs: number): number {
  const ms = nowMs - parseUtc(ts);
  return ms > 0 ? ms / MS_PER_HOUR : 0;
}

// Calendar days between two 'YYYY-MM-DD' strings, both parsed at UTC midnight so DST never shifts
// the difference off a whole number.
export function daysBetweenDates(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso + 'T00:00:00Z');
  const to = Date.parse(toIso + 'T00:00:00Z');
  return Math.round((to - from) / MS_PER_DAY);
}

// sessions.date is written server-LOCAL, so "3 days ago" is computed against the client's local
// today, not a UTC date.
export function localToday(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function dayLabel(lastDate: string | null, todayIso: string): string {
  if (!lastDate) return 'Not trained yet';
  const days = daysBetweenDates(lastDate, todayIso);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

// The repeated-bout effect: a first-ever RDL session and the tenth are not the same event.
export function noveltyFor(row: Pick<RecencyRow, 'prev_date' | 'last_date'>): number {
  if (!row.prev_date) return NOVELTY_FACTOR;
  return daysBetweenDates(row.prev_date, row.last_date) >= NOVELTY_DAYS ? NOVELTY_FACTOR : 1.0;
}

// Three bands, because three is the model's honest resolution. A percentage would imply a
// measurement nobody took.
export function bandFor(freshness: number | null | undefined): string {
  if (freshness === null || freshness === undefined) return 'Not trained yet';
  if (freshness >= BANDS.fresh) return 'Fresh';
  if (freshness >= BANDS.partly) return 'Partly recovered (est.)';
  return 'Recently trained';
}

// load      = min(1, SUM over the group's exercises of
//                     min(1, fractionalSets / 6) x novelty x exp(-hours / tau))
// freshness = 1 - load
//
// The min() cap applies per exercise bout rather than per session (tau varies per exercise), and
// only each exercise's most recent bout is summed (an older bout contributes <= 1.8% at tau <= 24h,
// below the resolution of three bands).
export function groupRecovery(
  recency: RecencyRow[] | null | undefined,
  nowMs: number = Date.now(),
  exercisesById: Record<string, Exercise> = {},
): GroupRecovery[] {
  const todayIso = localToday(new Date(nowMs));
  const acc: Record<string, { load: number; lastAt: string | null; lastDate: string | null; sets: number }> = {};
  MUSCLE_GROUPS.forEach((g) => {
    acc[g.id] = { load: 0, lastAt: null, lastDate: null, sets: 0 };
  });

  const rows = (recency || []).filter((r) => exercisesById[r.exercise_id]);

  // Pass 1: accumulate decayed load, and find each group's most recent bout.
  rows.forEach((r) => {
    const tau = tauFor(r.exercise_id);
    const decay = Math.exp(-hoursSince(r.last_at, nowMs) / tau);
    const novelty = noveltyFor(r);
    Object.entries(groupWeightsFor(exercisesById[r.exercise_id])).forEach(([groupId, w]) => {
      const g = acc[groupId];
      if (!g) return;
      g.load += Math.min(1, (r.sets * w) / REF_SETS) * novelty * decay;
      if (g.lastDate === null || r.last_date > g.lastDate) {
        g.lastDate = r.last_date;
        g.lastAt = r.last_at;
      }
    });
  });

  // Pass 2: fractional sets on that most recent date. Separate because it needs each group's
  // winning date, which pass 1 is still discovering.
  rows.forEach((r) => {
    Object.entries(groupWeightsFor(exercisesById[r.exercise_id])).forEach(([groupId, w]) => {
      const g = acc[groupId];
      if (g && r.last_date === g.lastDate) g.sets += r.sets * w;
    });
  });

  return MUSCLE_GROUPS.map((group) => {
    const g = acc[group.id];
    const trained = g.lastDate !== null && g.lastAt !== null;
    const freshness = trained ? 1 - Math.min(1, g.load) : null;
    return {
      id: group.id,
      label: group.label,
      freshness,
      band: bandFor(freshness),
      hoursSince: trained ? Math.round(hoursSince(g.lastAt!, nowMs)) : null,
      daysSince: trained ? daysBetweenDates(g.lastDate!, todayIso) : null,
      daysSinceLabel: dayLabel(g.lastDate, todayIso),
      fractionalSets: Math.round(g.sets * 10) / 10,
      lastDate: g.lastDate,
    };
  });
}
