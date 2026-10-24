import { Svg, Rect } from 'react-native-svg';

import { colors } from '../theme/tokens';
import type { IconProps } from './types';

export default function IconPause({ size = 20, color = colors.text, ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color} {...props}>
      <Rect x="5.5" y="4" width="5" height="16" rx="2" />
      <Rect x="13.5" y="4" width="5" height="16" rx="2" />
      <Rect x="7" y="5.5" width="2" height="13" rx="1" opacity=".2" />
      <Rect x="15" y="5.5" width="2" height="13" rx="1" opacity=".2" />
    </Svg>
  )
}
