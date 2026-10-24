import { Svg, Path } from 'react-native-svg';

import { colors } from '../theme/tokens';
import type { IconProps } from './types';

export default function IconCheck({ size = 20, color = colors.text, ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <Path d="M5.1 12.4 9.5 17l9.4-10" strokeWidth="4.2" />
      <Path d="M5.1 12.4 9.5 17l9.4-10" strokeWidth="1.5" opacity=".35" />
    </Svg>
  )
}
