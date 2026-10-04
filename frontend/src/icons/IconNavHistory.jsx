import { colors } from '../lib/theme'

// #229 two-tone nav icon: color alone is the state signal (never opacity,
// the failure mode on record at #211/#213/#228). Shapes lifted from
// IconClipboardList's own path data.
export default function IconNavHistory({ size = 26, active, ...props }) {
  const primary = active ? colors.accent : colors.muted
  const secondary = active ? colors.accentDeep : colors.muted3
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path fill={secondary} d="M9 2.2h6a1 1 0 0 1 1 1V5H8V3.2a1 1 0 0 1 1-1Z" />
      <path
        fill={primary}
        fillRule="evenodd"
        d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5ZM8 9h8v1.8H8ZM8 13h8v1.8H8ZM8 17h5.5v1.8H8Z"
      />
    </svg>
  )
}
