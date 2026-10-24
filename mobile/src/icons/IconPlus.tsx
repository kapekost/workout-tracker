import { Svg, Path, Rect } from 'react-native-svg';

import { colors } from '../theme/tokens';
import type { IconProps } from './types';

export default function IconPlus({ size = 20, color = colors.text, ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color} {...props}>
      <Rect x="9.1" y="4" width="5.8" height="16" rx="2.9" />
      <Rect x="4" y="9.1" width="16" height="5.8" rx="2.9" />
      <Path d="M10.4 6.4h3.2v11.2h-3.2z" opacity=".2" />
    </Svg>
  )
}
