import Constants from 'expo-constants';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../auth';
import { IconBarbell, IconUser } from '../icons';
import { colors, fontSize, icon, labelSpacing, space } from '../theme/tokens';
import { ThemedText } from './ThemedText';

// The app mark, the signed-in profile and the way out. The workout and auth screens render
// without it.
export function TopBar() {
  const insets = useSafeAreaInsets();
  const profile = useAuth((s) => s.profile);
  const logout = useAuth((s) => s.logout);

  return (
    <View
      style={{
        backgroundColor: colors.bg,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingTop: insets.top,
      }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: space.md,
          paddingHorizontal: space.xl,
        }}>
        <View style={{ flexShrink: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <IconBarbell size={icon.header} />
            <ThemedText accessibilityRole="header" weight="bold" style={{ letterSpacing: labelSpacing(fontSize.body) }}>
              Gym Tracker
            </ThemedText>
          </View>
          {Constants.expoConfig?.version ? (
            <ThemedText mono color="muted2" size="xs">
              v {Constants.expoConfig.version}
            </ThemedText>
          ) : null}
        </View>
        {profile ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.smd, flexShrink: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 }}>
              {profile.icon ? (
                <ThemedText size="md" accessible={false}>
                  {profile.icon}
                </ThemedText>
              ) : <IconUser size={icon.caption} />}
              <ThemedText size="md" numberOfLines={1} style={{ flexShrink: 1 }}>
                {profile.username}
              </ThemedText>
            </View>
            <Pressable
              accessibilityRole="button"
              hitSlop={space.md}
              onPress={() => logout().catch(() => {})}
              style={(s) => ({ minHeight: 44, justifyContent: 'center', opacity: s.pressed ? 0.7 : 1 })}>
              <ThemedText size="md" color="muted" weight="semibold">
                Log out
              </ThemedText>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}
