import { useState } from 'react';
import { Pressable, View } from 'react-native';

import DayIcon from '../icons/DayIcon';
import type { GroupRecovery } from '../recovery/recovery';
import { bestDayForMuscle } from '../recovery/muscles';
import type { Plan } from '../plan/plan';
import { colors, dayColor, icon, radius, space } from '../theme/tokens';
import { Button } from './Button';
import { Card } from './Card';
import { DisclosureRow } from './DisclosureRow';
import { Eyebrow } from './Eyebrow';
import { RecoveryRing } from './RecoveryRing';
import { ThemedText } from './ThemedText';

// Shown at the point of display, never behind an icon. The blind spot it discloses is
// one-directional: unlogged training can only make the estimate OVERSTATE freshness. Verbatim from
// the PWA; never shortened.
export const DISCLOSURE =
  'Estimated from your logged training only. No sleep, HRV or soreness data, and it ' +
  "doesn't know about classes or training you log elsewhere. Trust how you " +
  'feel over this estimate.';

const GAP = space.sm;
const MIN_CHIP = 140;

function rawFact(group: GroupRecovery): string {
  if (!group.lastDate) return `${group.label}: not trained yet.`;
  return `${group.label}: last trained ${group.hoursSince}h ago, ${group.fractionalSets} fractional sets.`;
}

function MuscleChip({ group, expanded, width, onToggle }: { group: GroupRecovery; expanded: boolean; width: number; onToggle: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={`${group.label}, ${group.band}`}
      onPress={onToggle}
      style={(s) => ({
        width,
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.smd,
        paddingVertical: space.sm,
        paddingHorizontal: space.smd,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        backgroundColor: expanded ? colors.surface1 : 'transparent',
        opacity: s.pressed ? 0.7 : 1,
      })}>
      <RecoveryRing freshness={group.freshness} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <ThemedText size="lg" weight="semibold">
          {group.label}
        </ThemedText>
        <ThemedText size="sm" color="muted">
          {group.band}
        </ThemedText>
      </View>
    </Pressable>
  );
}

type Props = {
  groups: GroupRecovery[];
  lastTrainedByDay: Record<string, string>;
  plan: Plan['plan'];
  cycle: string[];
  // A workout is open: starting another would orphan it.
  hasOpenWorkout: boolean;
  starting: boolean;
  onStart: (dayId: string) => void;
};

// The muscle-group recovery picker: collapsed by default, one chip expands at a time to its raw
// fact and the plan day that trains it best.
export function MuscleGroupPicker({ groups, lastTrainedByDay, plan, cycle, hasOpenWorkout, starting, onStart }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(0);

  // A first-run install has seven groups, all never trained. Seven empty rings say nothing.
  if (!groups.length || groups.every((g) => g.freshness === null)) return null;

  const columns = Math.max(1, Math.floor((width + GAP) / (MIN_CHIP + GAP)));
  const chipWidth = width > 0 ? Math.floor((width - GAP * (columns - 1)) / columns) : MIN_CHIP;

  const expanded = groups.find((g) => g.id === expandedId) ?? null;
  const bestDayId = expanded ? bestDayForMuscle(expanded.id, lastTrainedByDay, plan, cycle) : null;
  const bestDay = bestDayId ? plan[bestDayId] : null;

  return (
    <DisclosureRow isOpen={open} onToggle={() => setOpen((o) => !o)} header={<Eyebrow color="muted2" size="sm">Muscle groups</Eyebrow>}>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
        {groups.map((g) => (
          <MuscleChip
            key={g.id}
            group={g}
            width={chipWidth}
            expanded={expandedId === g.id}
            onToggle={() => setExpandedId(expandedId === g.id ? null : g.id)}
          />
        ))}
      </View>

      {expanded ? (
        <Card style={{ padding: space.xl, marginTop: space.md }}>
          {/* The one line on this screen that is simply true. */}
          <ThemedText size="md" color="textSecondary">
            {rawFact(expanded)}
          </ThemedText>
          <ThemedText size="base" color="muted2" style={{ marginTop: space.xs }}>
            {expanded.daysSinceLabel}
          </ThemedText>
          {bestDay && bestDayId ? (
            <View style={{ marginTop: space.md, gap: space.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <ThemedText size="base" color="muted">
                  Best day for {expanded.label} →
                </ThemedText>
                <DayIcon day={bestDayId} kind={bestDay.icon} size={icon.body} />
                <ThemedText size="base" color="muted">
                  {bestDay.name}
                </ThemedText>
              </View>
              {hasOpenWorkout ? (
                <ThemedText size="base" color="muted2">
                  Finish your current session first
                </ThemedText>
              ) : (
                <Button
                  label={starting ? 'Starting…' : `Start ${bestDay.name}`}
                  disabled={starting}
                  onPress={() => onStart(bestDayId)}
                  style={{ backgroundColor: dayColor(bestDayId) }}
                />
              )}
            </View>
          ) : null}
        </Card>
      ) : null}

      <ThemedText size="sm" color="muted2" style={{ marginTop: space.md, lineHeight: 17 }}>
        {DISCLOSURE}
      </ThemedText>
    </DisclosureRow>
  );
}
