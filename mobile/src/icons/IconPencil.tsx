import { Svg, Path } from 'react-native-svg';

import { colors } from '../theme/tokens';
import type { IconProps } from './types';

export default function IconPencil({ size = 20, color = colors.text, ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color} {...props}>
      <Path d="m14.8 4.1 5.1 5.1-10.9 10.9-5.8.7.7-5.8L14.8 4.1Z" />
      <Path d="m13.2 5.7 5.1 5.1" fill="none" stroke={color} strokeWidth="1.5" opacity=".3" />
      <Path d="m3.9 20.1 1.3-4.5 3.2 3.2-4.5 1.3Z" opacity=".45" />
    </Svg>
  )
}
