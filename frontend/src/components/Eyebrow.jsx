import { colors, type } from '../lib/theme'

// The uppercase "eyebrow" caption used above section headings and card
// titles throughout the app (design-system inventory §3.2b: 16 sites, 6
// sizes, 3 letter-spacings, 4 colors). One <p>, one default treatment;
// `color`/`size` cover the handful of sites whose current value genuinely
// differs from the default, and `style` is a last-resort escape hatch
// (e.g. a call site needing a different fontWeight) applied after the base
// styling so it can override anything above it.
// Props for an Eyebrow used as a form <label> above a field.
export const fieldLabel = { color: colors.muted, size: type.size.sm, style: { display: 'block', marginBottom: 6 } }

export default function Eyebrow({ as: Tag = 'p', children, color = colors.muted2, size = type.size.xs, style, ...rest }) {
  return (
    <Tag {...rest} style={{
      color,
      fontSize: size,
      fontWeight: type.weight.bold,
      letterSpacing: type.labelTracking,
      textTransform: 'uppercase',
      ...style,
    }}>
      {children}
    </Tag>
  )
}
