import { Svg, Path } from 'react-native-svg';

import { colors } from '../theme/tokens';
import type { IconProps } from './types';

export default function IconArrowTrendingUp({ size = 20, color = colors.text, ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <Path d="M3.5 17 9 11.3l3.6 3 7.4-8.3" strokeWidth="4.2" />
      <Path d="M3.5 17 9 11.3l3.6 3 7.4-8.3" strokeWidth="1.5" opacity=".35" />
      <Path d="M14.5 5.3h5.5v5.5" strokeWidth="2.6" />
    </Svg>
  )
}
