import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';

import { api } from '@/src/api';
import { Button } from '@/src/components/Button';
import { Card } from '@/src/components/Card';
import { EmptyState } from '@/src/components/EmptyState';
import { Eyebrow } from '@/src/components/Eyebrow';
import { ExercisePreview } from '@/src/components/ExercisePreview';
import { LoadError, LoadErrorHeading } from '@/src/components/LoadError';
import { MuscleGroupPicker } from '@/src/components/MuscleGroupPicker';
import { ResumeBanner } from '@/src/components/ResumeBanner';
import { Skeleton } from '@/src/components/Skeleton';
import { ThemedText } from '@/src/components/ThemedText';
import { NAV_BAR_HEIGHT } from '@/src/components/TabBar';
import { Toast } from '@/src/components/Toast';
import {
  displayDay,
  lastTrainedByDay,
  lastWorkoutLabel,
  nextWorkoutId,
  openSession,
  useHomeData,
  weekSessionCount,
  type SessionRow,
} from '@/src/home';
import DayIcon from '@/src/icons/DayIcon';
import { planDays } from '@/src/plan/plan';
import { exerciseById } from '@/src/recovery/muscles';
import { groupRecovery, localToday } from '@/src/recovery/recovery';
import { useToast } from '@/src/lib/useToast';
import { colors, dayColor, icon, space } from '@/src/theme/tokens';
import { useWorkout, workoutStore } from '@/src/workout';

export default function HomeScreen() {
  const router = useRouter();
  const { plan, sessions, recency, now } = useHomeData();
  const busy = useWorkout((s) => s.busy);
  const { toast, showToast } = useToast();

  // A failed read is not an empty account: none of the page's claims (next day, Start, Resume) are
  // made while the server cannot be asked what is in progress.
  if (plan.isError || sessions.isError) {
    return (
      <ScrollView contentContainerStyle={{ padding: space.xl }}>
        <LoadErrorHeading>Check your connection</LoadErrorHeading>
        <LoadError
          what="your workouts"
          onRetry={() => {
            plan.refetch();
            sessions.refetch();
          }}
        />
      </ScrollView>
    );
  }

  if (!plan.data || !sessions.data) {
    return (
      <View accessibilityLabel="Loading" style={{ padding: space.xl, gap: space.xxxl }}>
        <Skeleton height={96} />
        <Skeleton height={48} />
        <Skeleton height={180} />
      </View>
    );
  }

  const { plan: PLAN, cycle: CYCLE } = plan.data;
  const rows: SessionRow[] = sessions.data;
  const open = openSession(rows);
  const nextId = nextWorkoutId(rows, CYCLE);
  const shown = displayDay(open, nextId, PLAN);
  const color = dayColor(shown.id);
  const startable = open ? null : nextId ? PLAN[nextId] : null;
  const lastSession = rows[0];
  const lastPlan = lastSession ? PLAN[lastSession.workout_day] : null;
  const weekN = weekSessionCount(rows, localToday());
  const days = planDays(plan.data);

  async function startDay(dayId: string) {
    const day = PLAN[dayId];
    if (!day || workoutStore.getState().busy) return;
    await workoutStore.getState().start(day);
    const state = workoutStore.getState();
    if (!state.error) {
      router.push('/workout/active');
    } else if (state.conflict) {
      showToast('A workout is already in progress', 'error');
      sessions.refetch();
    } else {
      showToast("Couldn't start the workout. Try again.", 'error');
    }
  }

  async function resume() {
    if (workoutStore.getState().busy) return;
    await workoutStore.getState().resume(days);
    const state = workoutStore.getState();
    if (state.active && !state.error) {
      router.push('/workout/active');
    } else {
      showToast(state.error ?? "Couldn't resume the workout. Try again.", 'error');
      sessions.refetch();
    }
  }

  async function discard(session: SessionRow) {
    try {
      await api.delete(`/sessions/${session.id}`);
    } catch (err) {
      showToast("Couldn't discard the workout. Try again.", 'error');
      throw err;
    }
    if (workoutStore.getState().active?.id === session.id) workoutStore.getState().reset();
    await sessions.refetch();
  }

  const groups = recency.data && !recency.isError ? groupRecovery(recency.data, now, exerciseById(PLAN)) : [];

  return (
    <View style={{ flex: 1 }}>
      {open ? (
        <ResumeBanner key={open.id} session={open} plan={PLAN} now={now} onResume={resume} onDiscard={() => discard(open)} />
      ) : null}
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.xxxl }}>
        <View>
          <Eyebrow color="accent" size="base" style={{ marginBottom: space.xs }}>
            {open ? 'In progress' : 'Next up'}
          </Eyebrow>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <DayIcon day={shown.id} kind={shown.icon} size={icon.header} />
            <ThemedText accessibilityRole="header" size="title" weight="bold" style={{ flex: 1, lineHeight: 31 }}>
              {shown.name}
            </ThemedText>
          </View>
          {shown.tag ? (
            <ThemedText size="lg" color="muted2" style={{ marginTop: 6 }}>
              {shown.tag}
            </ThemedText>
          ) : null}
          <ThemedText size="md" color="muted" style={{ marginTop: 6 }}>
            {lastWorkoutLabel(rows, now)}
          </ThemedText>
          {rows.length > 0 ? (
            <ThemedText size="md" color="muted" style={{ marginTop: space.xs }}>
              This week: {weekN} {weekN === 1 ? 'session' : 'sessions'}
            </ThemedText>
          ) : null}
        </View>

        {open ? (
          <Button
            label={`Resume ${shown.name}`}
            disabled={busy}
            onPress={resume}
            style={{ backgroundColor: color }}
          />
        ) : startable ? (
          <Button
            label={busy ? 'Starting…' : `Start ${startable.name}`}
            disabled={busy}
            onPress={() => startDay(startable.id)}
            style={{ backgroundColor: color }}
          />
        ) : null}

        <ExercisePreview exercises={shown.exercises} color={color} />

        {recency.data && !recency.isError ? (
          <MuscleGroupPicker
            groups={groups}
            lastTrainedByDay={lastTrainedByDay(rows, CYCLE)}
            plan={PLAN}
            cycle={CYCLE}
            hasOpenWorkout={open !== null}
            starting={busy}
            onStart={startDay}
          />
        ) : null}

        {rows.length === 0 ? (
          <Card style={{ padding: space.xl }}>
            <ThemedText size="md">
              Your plan has {CYCLE.length} days: {CYCLE.map((id) => PLAN[id]?.name ?? id).join(', ')}.
            </ThemedText>
          </Card>
        ) : null}

        {lastSession && lastPlan ? (
          <View>
            <Eyebrow color="muted2" size="sm" style={{ marginBottom: space.md }}>
              Last session
            </Eyebrow>
            <Card style={{ overflow: 'hidden' }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Last session, ${lastPlan.name}, ${lastSession.date}. Open History`}
                onPress={() => router.navigate('/history')}
                style={(s) => ({
                  minHeight: 44,
                  padding: space.xl,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  opacity: s.pressed ? 0.7 : 1,
                })}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 }}>
                  <DayIcon day={lastPlan.id} kind={lastPlan.icon} size={icon.body} />
                  <View style={{ flexShrink: 1 }}>
                    <ThemedText weight="semibold">{lastPlan.name}</ThemedText>
                    <ThemedText size="md" color="muted" style={{ marginTop: 2 }}>
                      {lastSession.date}
                    </ThemedText>
                  </View>
                </View>
                <ThemedText color="muted" style={{ fontSize: 20 }}>
                  ›
                </ThemedText>
              </Pressable>
            </Card>
          </View>
        ) : null}

        {rows.length === 0 ? <EmptyState title="No sessions yet." /> : null}

        {/* No web equivalent. The exercise library is reachable from nowhere else yet. */}
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/exercises')}
          style={{ minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' }}>
          <ThemedText size="md" style={{ color: colors.muted2, textDecorationLine: 'underline' }}>
            Exercises
          </ThemedText>
        </Pressable>
      </ScrollView>
      <Toast toast={toast} bottom={NAV_BAR_HEIGHT + space.md} />
    </View>
  );
}
