import { Svg, Path } from 'react-native-svg';

import { colors } from '../theme/tokens';
import type { IconProps } from './types';

export default function IconBolt({ size = 20, color = colors.text, ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color} {...props}>
      <Path d="M13.8 2.5 5.1 13.7h5.8l-1 7.8 8.9-12h-5.8l.8-7Z" />
      <Path d="M13.8 5.5 7.9 12.9h5.1l-.5 3.7 4.1-6.1h-4.7l1.9-5Z" opacity=".22" />
    </Svg>
  )
}
