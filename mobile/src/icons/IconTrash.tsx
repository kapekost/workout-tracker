import { Svg, Path, Rect } from 'react-native-svg';

import { colors } from '../theme/tokens';
import type { IconProps } from './types';

export default function IconTrash({ size = 20, color = colors.text, ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color} {...props}>
      <Path d="M5.2 6.5h13.6l-.8 13a1.8 1.8 0 0 1-1.8 1.7H7.8A1.8 1.8 0 0 1 6 19.5l-.8-13Z" />
      <Rect x="4" y="4.2" width="16" height="2.6" rx="1.3" />
      <Path d="M9 4.2V2.8h6v1.4" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Path d="M9.1 9.2v7.5M12 9.2v7.5M14.9 9.2v7.5" stroke={color} strokeWidth="1.25" opacity=".3" />
    </Svg>
  )
}
