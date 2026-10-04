import { colors } from '../lib/theme'

// #229 two-tone nav icon: color alone is the state signal (never opacity,
// the failure mode on record at #211/#213/#228). Shapes lifted from
// IconHome's own path data.
export default function IconNavHome({ size = 26, active, ...props }) {
  const primary = active ? colors.accent : colors.muted
  const secondary = active ? colors.accentDeep : colors.muted3
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path fill={primary} d="M3.2 10.7 12 3.2l8.8 7.5-1.7 2V20a1 1 0 0 1-1 1h-4.4v-5.3h-3.4V21H5.9a1 1 0 0 1-1-1v-7.3l-1.7-2Z" />
      <path fill={secondary} d="m12 5.8-6.3 5.4h1.6v7.8h2.9v-5.3h3.6V19h2.9v-7.8h1.6L12 5.8Z" />
    </svg>
  )
}
