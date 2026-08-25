import { colors, type, radius } from '../lib/theme'

// Unifies the app's 3 hand-rolled pill/chip variants (design-system
// inventory §3.2c) onto one rendering: a stateless label chip (the muscle
// chips on Workout.jsx and ExerciseDetails.jsx) and a stateful filter/toggle
// chip (Progress.jsx's exercise picker). Padding/size/weight are fixed —
// Exercise.jsx's values survive per the component-extraction spec, matching
// Upgrade 1's type.weight table which already promotes the muscle chip's
// stray 500 to 600.
//
// `selected` being *present at all* (true OR false), not its value, is what
// switches the chip into the toggle treatment — a chip with no `selected`
// prop stays the plain, non-interactive label form. `onClick` isn't in the
// spec's prop table but is required to keep Progress.jsx's filter chip
// clickable; it's what decides whether Chip renders a <button> (with the
// tap-target floor Progress.jsx already relies on) or a plain <span>.
export default function Chip({ children, color = colors.mint, selected, size = 'md', onClick, style }) {
  const isToggle = selected !== undefined
  const base = {
    padding: '5px 14px',
    borderRadius: radius.pill,
    fontSize: type.size[size] ?? type.size.md,
    fontWeight: type.weight.semibold,
  }
  const visual = !isToggle
    ? { background: colors.border, border: 'none', color: colors.muted }
    : selected
      ? { background: colors.mintWash, border: `1px solid ${color}`, color }
      : { background: colors.card, border: `1px solid ${colors.border}`, color: colors.muted }

  if (onClick) {
    return (
      <button type="button" className="tap-target" onClick={onClick}
        style={{ ...base, ...visual, cursor: 'pointer', ...style }}>
        {children}
      </button>
    )
  }
  return <span style={{ ...base, ...visual, ...style }}>{children}</span>
}
