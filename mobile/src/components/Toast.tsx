import { useEffect } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ToastState } from '../lib/useToast';
import { colors, radius, space } from '../theme/tokens';
import { ThemedText } from './ThemedText';

type Props = {
  toast: ToastState | null;
  // Distance above the bottom safe area. Tab screens pass NAV_BAR_HEIGHT plus a gap to clear the bar.
  bottom?: number;
};

// A pill that floats over the screen. Errors interrupt (alert); everything else waits its turn.
export function Toast({ toast, bottom = space.xl }: Props) {
  const insets = useSafeAreaInsets();
  const isError = toast?.type === 'error';

  // A live region only reports changes to a view that already exists, and the toast is mounted
  // together with its text, so both platforms get an explicit announcement.
  useEffect(() => {
    if (toast) AccessibilityInfo.announceForAccessibility(toast.message);
  }, [toast]);

  if (!toast) return null;
  return (
    <View
      pointerEvents="none"
      accessibilityRole={isError ? 'alert' : undefined}
      style={{
        position: 'absolute',
        left: space.xl,
        right: space.xl,
        bottom: bottom + insets.bottom,
        alignItems: 'center',
      }}>
      <View
        style={{
          backgroundColor: isError ? colors.danger : colors.success,
          paddingVertical: space.md,
          paddingHorizontal: space.xxxl,
          borderRadius: radius.pill,
        }}>
        <ThemedText color="bg" weight="bold" style={{ textAlign: 'center', fontSize: 16 }}>
          {toast.message}
        </ThemedText>
      </View>
    </View>
  );
}
