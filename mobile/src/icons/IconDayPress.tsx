import { Svg, Path, Rect, Circle, G } from 'react-native-svg';

import { colors } from '../theme/tokens';
import type { IconProps } from './types';

// Upper B: overhead press. `color` draws the figure, `tone2` the shoulders.
export default function IconDayPress({ size = 24, color = colors.text, tone2 = color, ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...props}>
      <G fill={color}>
        <Rect x="3.1" y="0.5" width="2.3" height="7.4" rx="1" />
        <Rect x="1.2" y="1.9" width="1.7" height="4.6" rx=".8" />
        <Rect x="18.6" y="0.5" width="2.3" height="7.4" rx="1" />
        <Rect x="21.1" y="1.9" width="1.7" height="4.6" rx=".8" />
      </G>
      <Path d="M5.2 4.2H18.8" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <G fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <Path d="M7 9.4l.6-4.6M17 9.4l-.6-4.6M9.6 11.2h4.8M12 11.4v4M10.6 15.6h2.8" />
        <Path d="M10.6 15.6l-.5 5.2H8.6M13.4 15.6l.5 5.2h1.5" />
      </G>
      <Path d="M9.6 11.2 7 9.4M14.4 11.2 17 9.4" fill="none" stroke={tone2} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="12" cy="8.2" r="2.2" fill={color} />
    </Svg>
  )
}
