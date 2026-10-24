import { Pressable, type PressableProps } from 'react-native';

import { colors, radius, space } from '../theme/tokens';
import { ThemedText } from './ThemedText';

type Props = Omit<PressableProps, 'children'> & { label: string; variant?: 'primary' | 'secondary' };

// 48 high, the primary action's size for a thumb. The secondary form is the PWA's `.btn-secondary`.
export function Button({ label, variant = 'primary', disabled, style, ...rest }: Props) {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={(state) => [
        {
          minHeight: primary ? 48 : 44,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: primary ? radius.md : 10,
          paddingHorizontal: primary ? space.xxl : 18,
          backgroundColor: primary ? colors.accent : colors.border,
          opacity: disabled ? 0.55 : state.pressed ? 0.7 : 1,
        },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}>
      <ThemedText
        size="body"
        color={primary ? 'bg' : 'textSecondary'}
        weight={primary ? 'bold' : 'semibold'}>
        {label}
      </ThemedText>
    </Pressable>
  );
}
