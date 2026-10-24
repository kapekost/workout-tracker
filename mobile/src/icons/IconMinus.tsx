import { Svg, Rect } from 'react-native-svg';

import { colors } from '../theme/tokens';
import type { IconProps } from './types';

export default function IconMinus({ size = 20, color = colors.text, ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color} {...props}>
      <Rect x="4" y="9.1" width="16" height="5.8" rx="2.9" />
      <Rect x="6.2" y="10.3" width="11.6" height="1.2" rx=".6" opacity=".22" />
    </Svg>
  )
}
