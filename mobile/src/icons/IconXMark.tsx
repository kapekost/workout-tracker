import { Svg, Path } from 'react-native-svg';

import { colors } from '../theme/tokens';
import type { IconProps } from './types';

export default function IconXMark({ size = 20, color = colors.text, ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeLinecap="round" {...props}>
      <Path d="m6.5 6.5 11 11M17.5 6.5l-11 11" strokeWidth="4" />
      <Path d="m6.5 6.5 11 11M17.5 6.5l-11 11" strokeWidth="1.4" opacity=".35" />
    </Svg>
  )
}
