import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { REST_STEP_SEC, formatClock, remainingSeconds, type Rest } from '../workout/rest';
import { colors, radius, space } from '../theme/tokens';
import { Button } from './Button';
import { ThemedText } from './ThemedText';

type Props = { rest: Rest; onAdjust: (deltaSec: number) => void; onSkip: () => void };

// The caller keys it by the rest's end time, so each rest starts with a fresh clock.
export function RestTimer({ rest, onAdjust, onSkip }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const left = remainingSeconds(rest, now);

  return (
    <View
      style={{ gap: space.md, padding: space.xl, borderRadius: radius.lg, backgroundColor: colors.card }}
      accessibilityLiveRegion="polite">
      <ThemedText size="sm" color="muted">
        {left > 0 ? 'Rest' : 'Rest over'}
      </ThemedText>
      <ThemedText size="display" color={left > 0 ? 'text' : 'accent'}>
        {formatClock(left)}
      </ThemedText>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <View style={{ flex: 1 }}>
          <Button label={`-${REST_STEP_SEC}s`} onPress={() => onAdjust(-REST_STEP_SEC)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label={`+${REST_STEP_SEC}s`} onPress={() => onAdjust(REST_STEP_SEC)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Skip" onPress={onSkip} />
        </View>
      </View>
    </View>
  );
}
