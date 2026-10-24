import { type TextProps } from 'react-native';

import { colors, fontSize, labelSpacing } from '../theme/tokens';
import { ThemedText } from './ThemedText';

type Props = TextProps & {
  color?: keyof typeof colors;
  size?: keyof typeof fontSize;
};

// The uppercase caption above section headings and card titles.
export function Eyebrow({ color = 'muted2', size = 'xs', style, ...rest }: Props) {
  return (
    <ThemedText
      color={color}
      size={size}
      weight="bold"
      style={[{ textTransform: 'uppercase', letterSpacing: labelSpacing(fontSize[size]) }, style]}
      {...rest}
    />
  );
}
