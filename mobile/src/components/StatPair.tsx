import { View } from 'react-native';

import { colors, fontSize, space } from '../theme/tokens';
import { Eyebrow } from './Eyebrow';
import { ThemedText } from './ThemedText';

type Props = {
  label: string;
  value: string;
  valueColor?: keyof typeof colors;
  valueSize?: keyof typeof fontSize;
  align?: 'left' | 'right' | 'center';
};

export function StatPair({ label, value, valueColor = 'text', valueSize = 'title', align = 'left' }: Props) {
  const textAlign = { textAlign: align } as const;
  return (
    <View>
      <Eyebrow color="muted" size="base" style={textAlign}>
        {label}
      </Eyebrow>
      <ThemedText mono weight="bold" color={valueColor} size={valueSize} style={[{ marginTop: space.xs }, textAlign]}>
        {value}
      </ThemedText>
    </View>
  );
}
