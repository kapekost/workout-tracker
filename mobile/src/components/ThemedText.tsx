import { Text, type TextProps } from 'react-native';

import { colors, fontSize } from '../theme/tokens';

type Props = TextProps & {
  size?: keyof typeof fontSize;
  color?: keyof typeof colors;
};

export function ThemedText({ size = 'body', color = 'text', style, ...rest }: Props) {
  return <Text style={[{ color: colors[color], fontSize: fontSize[size] }, style]} {...rest} />;
}
