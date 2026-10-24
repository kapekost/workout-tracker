import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius } from '../theme/tokens';

type Props = { height: number; width?: DimensionValue; style?: StyleProp<ViewStyle> };

// A pulsing placeholder. `height` has no default on purpose: a caller that forgot it should get an
// obvious zero-height block, not a silent 16px one.
export function Skeleton({ height, width = '100%', style }: Props) {
  const [pulse] = useState(() => new Animated.Value(1));

  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce || cancelled) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [pulse]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ height, width, borderRadius: radius.sm, backgroundColor: colors.border, opacity: pulse }, style]}
    />
  );
}
