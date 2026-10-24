import { View } from 'react-native';

import type { Exercise } from '../plan/plan';
import { colors, space } from '../theme/tokens';
import { Card } from './Card';
import { Eyebrow } from './Eyebrow';
import { ThemedText } from './ThemedText';

type Props = { exercises: Exercise[]; color: string };

// The day's exercises with their targets, sets x reps in the day colour.
export function ExercisePreview({ exercises, color }: Props) {
  if (exercises.length === 0) return null;
  return (
    <Card style={{ padding: space.xxl }}>
      <Eyebrow color="muted2" size="sm" style={{ marginBottom: space.md }}>
        {exercises.length} {exercises.length === 1 ? 'exercise' : 'exercises'}
      </Eyebrow>
      {exercises.map((ex, i) => (
        <View
          key={ex.id}
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: space.md,
            paddingVertical: space.smd,
            borderBottomWidth: i < exercises.length - 1 ? 1 : 0,
            borderBottomColor: colors.border,
          }}>
          <View style={{ flex: 1 }}>
            <ThemedText weight="semibold">{ex.name}</ThemedText>
            {ex.alt ? (
              <ThemedText size="base" color="muted2">
                {ex.alt}
              </ThemedText>
            ) : null}
          </View>
          <ThemedText mono weight="bold" size="md" style={{ color }}>
            {ex.sets}×{ex.repsLow}–{ex.repsHigh}
          </ThemedText>
        </View>
      ))}
    </Card>
  );
}
