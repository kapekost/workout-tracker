import { Svg, Path } from 'react-native-svg';

import { colors } from '../theme/tokens';
import type { IconProps } from './types';

export default function IconClipboardList({ size = 20, color = colors.text, ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color} {...props}>
      <Path d="M9 2.2h6a1 1 0 0 1 1 1V5H8V3.2a1 1 0 0 1 1-1Z" opacity=".55" />
      <Path
        fillRule="evenodd"
        d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5ZM8 9h8v1.8H8ZM8 13h8v1.8H8ZM8 17h5.5v1.8H8Z"
      />
    </Svg>
  )
}
