import { Svg, Path, Rect } from 'react-native-svg';

import { colors } from '../theme/tokens';
import type { IconProps } from './types';

// #229 two-tone nav icon: a bar chart with a rising arrow (the owner's
// preferred shape, docs/design/229/NavBar.png option B) -- drawn fresh with
// bold solid shapes, no fine low-opacity detail. The line reuses
// IconArrowTrendingUp's own zigzag-and-arrowhead language so Progress's
// nav tab and its in-page trend line read as the same idea.
export default function IconNavProgress({ size = 26, active, ...props }: IconProps) {
  const primary = active ? colors.accent : colors.muted
  const secondary = active ? colors.accentDeep : colors.muted3
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...props}>
      <Rect fill={secondary} x="4" y="14" width="3.6" height="6" rx="1" />
      <Rect fill={secondary} x="10.2" y="10" width="3.6" height="10" rx="1" />
      <Rect fill={secondary} x="16.4" y="6" width="3.6" height="14" rx="1" />
      <Path fill="none" stroke={primary} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
        d="M3.5 15 9 9.3l3.6 3 7.4-8.3" />
      <Path fill="none" stroke={primary} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
        d="M14.5 3.3h5.5v5.5" />
    </Svg>
  )
}
