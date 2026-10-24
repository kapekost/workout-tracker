import { Svg, Path } from 'react-native-svg';

import { colors } from '../theme/tokens';
import type { IconProps } from './types';

export default function IconPlay({ size = 20, color = colors.text, ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color} {...props}>
      <Path d="M8 5.14v13.72a1 1 0 0 0 1.5.87l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14Z" />
      <Path d="M9.8 7.6v8.8l7-4.4-7-4.4Z" opacity=".2" />
    </Svg>
  )
}
