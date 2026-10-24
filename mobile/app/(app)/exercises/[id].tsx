import { useLocalSearchParams, useRouter } from 'expo-router';
import { Linking, ScrollView, View } from 'react-native';

import { Button } from '@/src/components/Button';
import { Screen } from '@/src/components/Screen';
import { ThemedText } from '@/src/components/ThemedText';
import { findExercise, repRange, safeVideoUrl } from '@/src/plan/plan';
import { usePlan } from '@/src/plan';
import { space } from '@/src/theme/tokens';

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, isPending, isError, refetch } = usePlan();
  const exercise = data ? findExercise(data, id) : undefined;
  const video = safeVideoUrl(exercise?.ytUrl ?? null);

  return (
    <View style={{ flex: 1 }}>
      <Screen loading={isPending} error={isError} onRetry={refetch}>
        {exercise ? (
          <ScrollView contentContainerStyle={{ padding: space.xxl, gap: space.xl }}>
            <View>
              <ThemedText size="title">{exercise.name}</ThemedText>
              {exercise.alt ? <ThemedText color="muted">{exercise.alt}</ThemedText> : null}
            </View>
            <ThemedText>
              {exercise.sets} sets × {repRange(exercise)} reps{exercise.bodyweight ? ', bodyweight' : ''}
            </ThemedText>
            {exercise.muscles.length > 0 ? (
              <ThemedText color="muted2">{exercise.muscles.join(' · ')}</ThemedText>
            ) : null}
            <View style={{ gap: space.md }}>
              <ThemedText size="strong">Form cues</ThemedText>
              {exercise.cues.map((cue) => (
                <ThemedText key={cue} color="textSecondary">
                  • {cue}
                </ThemedText>
              ))}
            </View>
          </ScrollView>
        ) : (
          <View style={{ flex: 1, justifyContent: 'center', padding: space.xxxl }}>
            <ThemedText color="muted">This exercise is not in your plan.</ThemedText>
          </View>
        )}
      </Screen>
      <View style={{ padding: space.xl, gap: space.md }}>
        {video ? <Button label="Watch form video" onPress={() => Linking.openURL(video)} /> : null}
        <Button label="Back to exercises" onPress={() => router.back()} />
      </View>
    </View>
  );
}
