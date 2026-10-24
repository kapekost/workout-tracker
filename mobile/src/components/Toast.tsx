import { useEffect } from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ToastState } from '../lib/useToast';
import { colors, radius, space } from '../theme/tokens';
import { NAV_BAR_HEIGHT } from './TabBar';
import { ThemedText } from './ThemedText';

type Props = {
  toast: ToastState | null;
  // Distance above the bottom safe area. The default clears the tab bar.
  bottom?: number;
};

// A pill that floats over the screen. Errors interrupt (alert); everything else waits its turn.
export function Toast({ toast, bottom = NAV_BAR_HEIGHT + space.xl }: Props) {
  const insets = useSafeAreaInsets();
  const message = toast?.message;
  const isError = toast?.type === 'error';

  // accessibilityLiveRegion is Android only; VoiceOver needs an explicit announcement.
  useEffect(() => {
    if (message && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  if (!toast) return null;
  return (
    <View
      pointerEvents="none"
      accessibilityRole={isError ? 'alert' : undefined}
      accessibilityLiveRegion={isError ? 'assertive' : 'polite'}
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
        <ThemedText color="bg" weight="bold" style={{ textAlign: 'center' }}>
          {toast.message}
        </ThemedText>
      </View>
    </View>
  );
}
