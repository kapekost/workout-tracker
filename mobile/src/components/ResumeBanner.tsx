import { useState } from 'react';
import { Pressable, View } from 'react-native';

import DayIcon from '../icons/DayIcon';
import { IconCheck, IconTrash, IconXMark } from '../icons';
import type { SessionRow } from '../home/home';
import { elapsedLabel } from '../home/home';
import type { Plan } from '../plan/plan';
import { colors, dayColor, icon, space } from '../theme/tokens';
import { ThemedText } from './ThemedText';

type Props = {
  session: SessionRow;
  plan: Plan['plan'];
  now: number;
  onResume: () => void;
  // Resolves when the server has dropped the session; rejects when it could not.
  onDiscard: () => Promise<void>;
};

const TARGET = { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' } as const;

// The open workout, pinned above the Home content. Discarding is two steps (trash, then confirm
// or cancel) because it deletes the logged sets. The caller keys it by session id, so the confirm
// step starts closed for a different workout.
export function ResumeBanner({ session, plan, now, onResume, onDiscard }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const day = plan[session.workout_day];
  const color = dayColor(session.workout_day);
  const name = day ? day.name : 'Workout';

  async function discard() {
    if (busy) return;
    setBusy(true);
    try {
      await onDiscard();
    } catch {
      // The screen reports it; the banner stays so the workout is still reachable.
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingHorizontal: space.xl,
        paddingVertical: space.sm,
        backgroundColor: colors.card,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: colors.border,
      }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Resume ${name}, in progress ${elapsedLabel(session.created_at, now)}`}
        onPress={onResume}
        style={{ flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: space.smd }}>
        <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: color }} />
        {day ? <DayIcon day={session.workout_day} kind={day.icon} size={icon.body} /> : null}
        <View style={{ flex: 1 }}>
          <ThemedText size="md" weight="semibold" color="textSecondary">
            {name} in progress
          </ThemedText>
          <ThemedText size="sm" color="muted2">
            {elapsedLabel(session.created_at, now)}
          </ThemedText>
        </View>
        <ThemedText size="md" weight="bold" style={{ color }}>
          Resume ›
        </ThemedText>
      </Pressable>
      {confirming ? (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <ThemedText size="sm" color="muted">
            Discard?
          </ThemedText>
          <Pressable accessibilityRole="button" accessibilityLabel="Confirm discard" disabled={busy} onPress={discard} style={TARGET}>
            <IconCheck size={icon.body} color={colors.danger} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel discard" disabled={busy} onPress={() => setConfirming(false)} style={TARGET}>
            <IconXMark size={icon.body} color={colors.muted} />
          </Pressable>
        </View>
      ) : (
        <Pressable accessibilityRole="button" accessibilityLabel="Discard session" onPress={() => setConfirming(true)} style={TARGET}>
          <IconTrash size={icon.body} color={colors.muted} />
        </Pressable>
      )}
    </View>
  );
}
