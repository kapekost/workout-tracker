import { Svg, Path, Rect, Circle, G } from 'react-native-svg';

import { colors } from '../theme/tokens';
import type { IconProps } from './types';

// Lower A: back squat. `color` draws the figure, `tone2` the quads.
export default function IconDaySquat({ size = 24, color = colors.text, tone2 = color, ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...props}>
      <G fill={color}>
        <Rect x="3.1" y="4.3" width="2.3" height="7.4" rx="1" />
        <Rect x="1.2" y="5.7" width="1.7" height="4.6" rx=".8" />
        <Rect x="18.6" y="4.3" width="2.3" height="7.4" rx="1" />
        <Rect x="21.1" y="5.7" width="1.7" height="4.6" rx=".8" />
      </G>
      <Path d="M5.2 8H18.8" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Path d="M12 10.2v3.6M10.2 14h3.6M7.4 16.4l.4 4.4h-1.4M16.6 16.4l-.4 4.4h1.4" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M10.2 14 7.4 16.4M13.8 14l2.8 2.4" fill="none" stroke={tone2} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="12" cy="5" r="2.2" fill={color} />
    </Svg>
  )
}
