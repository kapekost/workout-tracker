import { Svg, Path, Rect, Circle, G } from 'react-native-svg';

import { colors } from '../theme/tokens';
import type { IconProps } from './types';

// Lower B: deadlift. `color` draws the figure, `tone2` the glutes and hamstrings.
export default function IconDayDeadlift({ size = 24, color = colors.text, tone2 = color, ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...props}>
      <G fill={color}>
        <Rect x="3.1" y="12.9" width="2.3" height="7.4" rx="1" />
        <Rect x="1.2" y="14.3" width="1.7" height="4.6" rx=".8" />
        <Rect x="18.6" y="12.9" width="2.3" height="7.4" rx="1" />
        <Rect x="21.1" y="14.3" width="1.7" height="4.6" rx=".8" />
      </G>
      <Path d="M5.2 16.6H18.8" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Path d="M8.6 7.6h6.8M8.6 7.8l-.8 8.6M15.4 7.8l.8 8.6M12 7.8v4.6M10.2 20.8H9M13.8 20.8H15" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M10.6 12.6h2.8M10.6 12.6l-.4 8.2M13.4 12.6l.4 8.2" fill="none" stroke={tone2} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="12" cy="4" r="2.2" fill={color} />
    </Svg>
  )
}
