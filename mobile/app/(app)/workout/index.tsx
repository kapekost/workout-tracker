import { Redirect, useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { Button } from '@/src/components/Button';
import { Screen } from '@/src/components/Screen';
import { ThemedText } from '@/src/components/ThemedText';
import { planDays } from '@/src/plan/plan';
import { usePlan } from '@/src/plan';
import { colors, space } from '@/src/theme/tokens';
import { useWorkout } from '@/src/workout';

export default function StartWorkoutScreen() {
  const router = useRouter();
  const { data, isPending, isError, refetch } = usePlan();
  const { active, busy, error, conflict, start, resume } = useWorkout((s) => s);
  const days = data ? planDays(data) : [];

  if (active) return <Redirect href="/workout/active" />;

  return (
    <View style={{ flex: 1 }}>
      <Screen loading={isPending} error={isError} onRetry={refetch}>
        <ScrollView contentContainerStyle={{ padding: space.xxl, gap: space.xl }}>
          <ThemedText size="title">Start a workout</ThemedText>
          {error ? (
            <ThemedText color="danger" accessibilityRole="alert">
              {error}
            </ThemedText>
          ) : null}
          {conflict ? <Button label="Resume the workout in progress" onPress={() => resume(days)} disabled={busy} /> : null}
          {days.map((day) => (
            <View key={day.id} style={{ gap: space.xs }}>
              <Button label={`Start ${day.name}`} onPress={() => start(day)} disabled={busy} />
              {day.tag ? (
                <ThemedText size="sm" color="muted">
                  {day.tag}
                </ThemedText>
              ) : null}
            </View>
          ))}
        </ScrollView>
      </Screen>
      <View style={{ padding: space.xl, borderTopWidth: 1, borderTopColor: colors.border }}>
        <Button label="Back" onPress={() => router.back()} />
      </View>
    </View>
  );
}
