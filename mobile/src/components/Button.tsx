import { Pressable, type PressableProps } from 'react-native';

import { colors, radius, space } from '../theme/tokens';
import { ThemedText } from './ThemedText';

type Props = Omit<PressableProps, 'children'> & { label: string };

// 48 high, the primary action's size for a thumb.
export function Button({ label, disabled, style, ...rest }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={(state) => [
        {
          minHeight: 48,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius.md,
          paddingHorizontal: space.xxl,
          backgroundColor: colors.accent,
          opacity: disabled ? 0.5 : state.pressed ? 0.8 : 1,
        },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}>
      <ThemedText size="body" style={{ color: colors.bg, fontWeight: '700' }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}
