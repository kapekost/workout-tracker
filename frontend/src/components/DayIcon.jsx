import IconDayUpper from '../icons/IconDayUpper'
import IconDayLower from '../icons/IconDayLower'
import DayAccent from './DayAccent'
import { PLAN } from '../data/workoutPlan'

export default function DayIcon({ day, size = 20 }) {
  const Body = PLAN[day]?.icon === 'lower' ? IconDayLower : IconDayUpper
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: size, height: size, flexShrink: 0 }}>
      <Body size={size} />
      <span style={{ position: 'absolute', bottom: -2, right: -2 }}>
        <DayAccent day={day} size={6} data-testid="day-icon-dot" />
      </span>
    </span>
  )
}
