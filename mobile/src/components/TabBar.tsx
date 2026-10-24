import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, View } from 'react-native';

import { IconNavHistory, IconNavHome, IconNavProgress } from '../icons';
import { colors, fontFamily, icon, space } from '../theme/tokens';
import { Eyebrow } from './Eyebrow';

// The bar's height above the safe area: the top padding plus a 48 tap target.
export const NAV_BAR_HEIGHT = space.sm + 48;

const TABS = {
  home: { label: 'Home', Icon: IconNavHome },
  progress: { label: 'Progress', Icon: IconNavProgress },
  history: { label: 'History', Icon: IconNavHistory },
};

// The PWA's bottom nav. The active tab changes both tones of its icon and its label colour,
// never opacity.
export function TabBar({ state, emitter, navigateToTab, insets }: BottomTabBarProps) {
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        backgroundColor: colors.card,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingTop: space.sm,
        paddingBottom: insets.bottom,
      }}>
      {state.routes.map((route, index) => {
        const tab = TABS[route.name as keyof typeof TABS];
        if (!tab) return null;
        const active = state.index === index;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: active }}
            onPress={() => {
              const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!active && !event.defaultPrevented) navigateToTab(route.key);
            }}
            style={{ flex: 1, minHeight: 48, alignItems: 'center', gap: 3, paddingVertical: space.xs }}>
            {/* Colour alone is a weak state cue, so the active tab also gets a bar. */}
            <View
              style={{
                position: 'absolute',
                top: -space.sm,
                width: 28,
                height: 2,
                backgroundColor: active ? colors.accent : 'transparent',
              }}
            />
            <tab.Icon size={icon.nav} active={active} />
            <Eyebrow color={active ? 'accent' : 'muted'} style={{ fontFamily: fontFamily('semibold') }}>
              {tab.label}
            </Eyebrow>
          </Pressable>
        );
      })}
    </View>
  );
}
