// The plan as GET /api/plan returns it, and the reads the exercise screens need. Nothing here
// imports Expo, so the tests run in plain Node.

export type Exercise = {
  id: string;
  name: string;
  alt: string | null;
  sets: number;
  repsLow: number;
  repsHigh: number;
  bodyweight: boolean;
  muscles: string[];
  ytUrl: string | null;
  cues: string[];
  // The substitute the plan offers; sets logged under it still count toward recovery.
  altExercise?: Exercise | null;
};

export type PlanDay = {
  id: string;
  name: string;
  tag: string | null;
  icon: string | null;
  exercises: Exercise[];
};

export type Plan = { plan: Record<string, PlanDay>; cycle: string[] };

export const planQueryOptions = (api: { get<T>(path: string): Promise<T> }) => ({
  queryKey: ['plan'] as const,
  queryFn: () => api.get<Plan>('/plan'),
});

// The days in training order, which is the order of `cycle`.
export function planDays(data: Plan): PlanDay[] {
  return data.cycle.flatMap((key) => (data.plan[key] ? [data.plan[key]] : []));
}

export function findExercise(data: Plan, id: string): Exercise | undefined {
  for (const day of planDays(data)) {
    const found = day.exercises.find((ex) => ex.id === id);
    if (found) return found;
  }
  return undefined;
}

export function repRange(ex: Exercise): string {
  return ex.repsLow === ex.repsHigh ? `${ex.repsLow}` : `${ex.repsLow}-${ex.repsHigh}`;
}

// Only a plain https link is opened from a plan field.
export function safeVideoUrl(url: string | null): string | null {
  return url && /^https:\/\//i.test(url) ? url : null;
}
