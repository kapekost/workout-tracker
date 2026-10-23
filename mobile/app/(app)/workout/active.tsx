import { Redirect } from 'expo-router';
import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';

import { Button } from '@/src/components/Button';
import { ThemedText } from '@/src/components/ThemedText';
import { colors, radius, space } from '@/src/theme/tokens';
import { useWorkout } from '@/src/workout';
import { currentExercise, nextSetNumber, parseSetInput, setsFor } from '@/src/workout/session';

const input = {
  flex: 1,
  minHeight: 56,
  borderRadius: radius.md,
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.card,
  color: colors.text,
  paddingHorizontal: space.xl,
  fontSize: 20,
  textAlign: 'center' as const,
};

export default function ActiveWorkoutScreen() {
  const { active, busy, error, logSet, nextExercise, finish } = useWorkout((s) => s);
  const [reps, setReps] = useState('');
  const [weight, setWeight] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);

  // Finishing clears the session, which sends the user back to Home.
  if (!active) return <Redirect href="/" />;

  const exercise = currentExercise(active);
  const done = setsFor(active, exercise.id);
  const isLast = active.exerciseIndex === active.day.exercises.length - 1;

  async function log() {
    const parsed = parseSetInput(reps || String(exercise.repsHigh), weight, exercise.bodyweight);
    if ('error' in parsed) {
      setInputError(parsed.error);
      return;
    }
    setInputError(null);
    await logSet(parsed.reps, parsed.weightKg);
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: space.xxl, gap: space.xl }}>
        <ThemedText size="sm" color="muted">
          {active.day.name} · exercise {active.exerciseIndex + 1} of {active.day.exercises.length}
        </ThemedText>
        <ThemedText size="title">{exercise.name}</ThemedText>
        <ThemedText color="muted2">
          Set {nextSetNumber(active)} of {exercise.sets} · target {exercise.repsLow}-{exercise.repsHigh} reps
        </ThemedText>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <TextInput
            accessibilityLabel="Reps"
            placeholder={`Reps (${exercise.repsHigh})`}
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            value={reps}
            onChangeText={setReps}
            style={input}
          />
          <TextInput
            accessibilityLabel="Weight in kilograms"
            placeholder="kg"
            placeholderTextColor={colors.muted}
            keyboardType="decimal-pad"
            value={weight}
            onChangeText={setWeight}
            style={input}
          />
        </View>
        {inputError || error ? (
          <ThemedText color="danger" accessibilityRole="alert">
            {inputError ?? error}
          </ThemedText>
        ) : null}
        {done.length > 0 ? (
          <View style={{ gap: space.xs }}>
            {done.map((s) => (
              <ThemedText key={s.setNumber} color="textSecondary">
                Set {s.setNumber}: {s.reps} × {s.weightKg} kg
              </ThemedText>
            ))}
          </View>
        ) : null}
      </ScrollView>
      <View style={{ padding: space.xl, gap: space.md, borderTopWidth: 1, borderTopColor: colors.border }}>
        <Button label="Log set" onPress={log} disabled={busy} />
        {isLast ? (
          <Button label="Finish workout" onPress={finish} disabled={busy} />
        ) : (
          <Button label="Next exercise" onPress={nextExercise} disabled={busy} />
        )}
      </View>
    </View>
  );
}
