import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { IconChevronDown } from '../icons';
import { colors, icon, space } from '../theme/tokens';
import { Card } from './Card';

type Props = {
  // Everything before the chevron; each caller lays out its own header.
  header: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  bodyPadding?: number;
};

// The expandable card row: a header button ending in a chevron, and a body shown only while open.
export function DisclosureRow({ header, isOpen, onToggle, children, style, bodyPadding = space.xl }: Props) {
  return (
    <Card style={[{ overflow: 'hidden' }, style]}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        style={(s) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: space.md,
          padding: space.xl,
          opacity: s.pressed ? 0.7 : 1,
        })}>
        {header}
        <IconChevronDown
          size={icon.body}
          color={colors.muted}
          style={{ flexShrink: 0, transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }}
        />
      </Pressable>
      {isOpen ? (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, padding: bodyPadding }}>{children}</View>
      ) : null}
    </Card>
  );
}
