import IconDayUpper from '../icons/IconDayUpper'
import IconDayLower from '../icons/IconDayLower'
import DayAccent from './DayAccent'
import { PLAN } from '../data/workoutPlan'

export default function DayIcon({ day, size = 24 }) {
  const Body = PLAN[day]?.icon === 'lower' ? IconDayLower : IconDayUpper
  return (
    // IconDayUpper paints wider than its size x size box (a paint-only
    // scale() transform, see that file), so without inline margin it runs
    // into the day name beside it -- visible once icons grew 2026-09-28.
    // verticalAlign centers it on the text line instead of sitting on the
    // baseline above it.
    <span style={{
      position: 'relative', display: 'inline-flex', width: size, height: size, flexShrink: 0,
      marginInline: Math.ceil(size * 0.16), verticalAlign: 'middle'
    }}>
      <Body size={size} />
      <span style={{ position: 'absolute', bottom: -2, right: -2 }}>
        <DayAccent day={day} size={6} data-testid="day-icon-dot" />
      </span>
    </span>
  )
}
