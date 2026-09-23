import IconDayUpper from '../icons/IconDayUpper'
import IconDayLower from '../icons/IconDayLower'
import DayAccent from './DayAccent'
import { PLAN, DAY_COLORS, DAY_COLOR_FALLBACK } from '../data/workoutPlan'

// The wrapper span below carries a `background` matching DayAccent's own
// DAY_COLORS[day] ?? DAY_COLOR_FALLBACK resolution (same exported constants,
// same one-line expression — not an independent resolution) purely so the
// dot is queryable by data-testid. DayAccent's own <div> doesn't spread
// props, so it can't carry data-testid itself, and it's an existing
// component this task must not modify. DayAccent is still what actually
// renders the visible dot (painted on top, same color).
export default function DayIcon({ day, size = 20 }) {
  const Body = PLAN[day]?.icon === 'lower' ? IconDayLower : IconDayUpper
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: size, height: size, flexShrink: 0 }}>
      <Body size={size} />
      <span
        data-testid="day-icon-dot"
        style={{ position: 'absolute', bottom: -2, right: -2, background: DAY_COLORS[day] ?? DAY_COLOR_FALLBACK }}
      >
        <DayAccent day={day} size={6} />
      </span>
    </span>
  )
}
