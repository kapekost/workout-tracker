import { Text, type TextProps } from 'react-native';

import { colors, fontFamily, fontSize } from '../theme/tokens';

type Props = TextProps & {
  size?: keyof typeof fontSize;
  color?: keyof typeof colors;
  weight?: 'regular' | 'semibold' | 'bold';
  // JetBrains Mono, for numbers and clocks.
  mono?: boolean;
};

export function ThemedText({ size = 'body', color = 'text', weight = 'regular', mono, style, ...rest }: Props) {
  return (
    <Text
      style={[{ color: colors[color], fontSize: fontSize[size], fontFamily: fontFamily(weight, mono) }, style]}
      {...rest}
    />
  );
}
