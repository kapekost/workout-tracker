import IconDayCurl from '../icons/IconDayCurl'
import IconDayPress from '../icons/IconDayPress'
import IconDaySquat from '../icons/IconDaySquat'
import IconDayDeadlift from '../icons/IconDayDeadlift'
import { DAY_COLORS, DAY_COLOR_FALLBACK } from '../data/workoutPlan'
import { usePlan } from '../lib/planContext'
import { colors, icon, tint } from '../lib/theme'

const BY_DAY = { upper_a: IconDayCurl, upper_b: IconDayPress, lower_a: IconDaySquat, lower_b: IconDayDeadlift }
const BY_KIND = { upper: IconDayCurl, lower: IconDaySquat }

// A tint of the day colour would vanish against volt, so Upper A takes the deeper accent.
function secondTone(day, color) {
  return day === 'upper_a' ? colors.accentDeep : tint(color, 0.6)
}

export default function DayIcon({ day, size = icon.heading }) {
  const { plan } = usePlan()
  const Glyph = BY_DAY[day] ?? BY_KIND[plan[day]?.icon] ?? IconDayCurl
  const color = DAY_COLORS[day] ?? DAY_COLOR_FALLBACK
  return (
    <span style={{ display: 'inline-flex', flexShrink: 0 }}>
      <Glyph size={size} color={color} tone2={secondTone(day, color)} />
    </span>
  )
}
