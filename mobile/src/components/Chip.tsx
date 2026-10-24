import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fontSize, radius } from '../theme/tokens';
import { ThemedText } from './ThemedText';

type Props = {
  children: string;
  // Drives the selected toggle only; a plain label chip is always muted.
  color?: string;
  // Present at all (true or false) makes the chip a toggle.
  selected?: boolean;
  size?: 'sm' | 'md';
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function Chip({ children, color = colors.accent, selected, size = 'md', onPress, style }: Props) {
  const isToggle = selected !== undefined;
  const visual = !isToggle
    ? { backgroundColor: colors.border, borderColor: colors.border, text: colors.muted }
    : selected
      ? { backgroundColor: colors.accentWash, borderColor: color, text: color }
      : { backgroundColor: colors.card, borderColor: colors.border, text: colors.muted };
  const box: ViewStyle = {
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: isToggle ? 1 : 0,
    backgroundColor: visual.backgroundColor,
    borderColor: visual.borderColor,
    alignItems: 'center',
    justifyContent: 'center',
  };
  const label = (
    <ThemedText weight="semibold" style={{ color: visual.text, fontSize: fontSize[size === 'sm' ? 'sm' : 'md'] }}>
      {children}
    </ThemedText>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={isToggle ? { selected } : undefined}
        onPress={onPress}
        style={(s) => [box, { minHeight: 44, minWidth: 44, opacity: s.pressed ? 0.7 : 1 }, style]}>
        {label}
      </Pressable>
    );
  }
  return <View style={[box, style]}>{label}</View>;
}
