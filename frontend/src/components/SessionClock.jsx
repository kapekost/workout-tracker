import { useEffect, useState } from 'react'
import { elapsedSeconds, formatClock } from '../lib/timer'
import { colors, type, icon } from '../lib/theme'
import { IconBolt } from '../icons'
import Eyebrow from './Eyebrow'

// #229 decision 6: owns its own 1s interval so a tick re-renders only this
// eyebrow, not the whole Workout page (20+ set rows). TimerBar keeps its
// own separate interval for the rest clock.
export default function SessionClock({ startMs, wakeLockHeld, color }) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <Eyebrow color={color} size={type.size.sm}>
      ACTIVE SESSION · {formatClock(elapsedSeconds(startMs, now))}
      {wakeLockHeld && (
        <span className="screen-on-marker" style={{ color: colors.muted }}>
          {' '}<IconBolt size={icon.caption} /> SCREEN ON
        </span>
      )}
    </Eyebrow>
  )
}
