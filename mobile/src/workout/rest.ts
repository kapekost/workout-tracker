// The rest timer as an end time, not a ticking counter, so it is right after the app has been in
// the background. The screen reads the clock once a second and asks how much is left.

export type Rest = { endsAtMs: number };

export const DEFAULT_REST_SEC = 90;
export const REST_STEP_SEC = 30;

export const startRest = (nowMs: number, seconds: number = DEFAULT_REST_SEC): Rest => ({
  endsAtMs: nowMs + seconds * 1000,
});

export const remainingSeconds = (rest: Rest, nowMs: number): number =>
  Math.max(0, Math.ceil((rest.endsAtMs - nowMs) / 1000));

// Moves the end by `deltaSec`. A rest cut to nothing is over, so it becomes null.
export function adjustRest(rest: Rest, deltaSec: number, nowMs: number): Rest | null {
  const next = { endsAtMs: rest.endsAtMs + deltaSec * 1000 };
  return remainingSeconds(next, nowMs) > 0 ? next : null;
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
