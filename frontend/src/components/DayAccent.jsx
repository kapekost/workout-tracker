import { radius, space } from '../lib/theme'
import { DAY_COLORS, DAY_COLOR_FALLBACK } from '../data/workoutPlan'

// Unifies the app's 3 hand-rolled day-accent shapes (design-system inventory
// §3.2g) — a small circle (ResumeBanner.jsx, Workout.jsx's set-dots) or a
// bar (History.jsx) — behind one DAY_COLORS[day] ?? DAY_COLOR_FALLBACK
// resolution (the fallback constant Upgrade 1's Task 13 already introduced).
//
// shape="bar" width×height is 8×36 to match History.jsx's current bar
// pixel-for-pixel; its radius uses the `radius.sm` token per the spec, which
// is 8 in theme.js — History.jsx's actual current radius is 4 (never
// tokenized; no 4-value token exists). Rather than introduce a new
// hardcoded literal to hit 4 exactly, this uses the token the spec names,
// which very slightly rounds the bar's end corners more than today.
export default function DayAccent({ day, shape = 'dot', size = space.sm }) {
  const color = DAY_COLORS[day] ?? DAY_COLOR_FALLBACK
  if (shape === 'bar') {
    return (
      <div style={{ width: size, height: 36, borderRadius: radius.sm, background: color, flexShrink: 0 }} />
    )
  }
  return (
    <div style={{ width: size, height: size, borderRadius: radius.circle, background: color, flexShrink: 0 }} />
  )
}
