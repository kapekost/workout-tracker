import { View, type ViewProps } from 'react-native';

import { colors, radius } from '../theme/tokens';

// The PWA's `.card`.
export function Card({ style, ...rest }: ViewProps) {
  return (
    <View
      style={[{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg }, style]}
      {...rest}
    />
  );
}
