import { useEffect, useRef, useState } from 'react'
import { remainingSeconds, elapsedSeconds, formatClock } from '../lib/timer'

function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880; osc.connect(gain); gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    osc.start()
    osc.stop(ctx.currentTime + 0.25)
  } catch { /* audio not available */ }
}

export default function TimerBar({ sessionStartMs, restStartMs, restTargetSec, onAddRest, onSkipRest, color }) {
  const [now, setNow] = useState(Date.now())
  const [flash, setFlash] = useState(false)
  const firedRef = useRef(false)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // reset the "done" latch whenever a new rest period starts
  useEffect(() => { firedRef.current = false; setFlash(false) }, [restStartMs])

  const sessionStr = formatClock(elapsedSeconds(sessionStartMs, now))
  const resting = restStartMs != null
  const rem = resting ? remainingSeconds(restStartMs, restTargetSec, now) : 0

  useEffect(() => {
    if (resting && rem === 0 && !firedRef.current) {
      firedRef.current = true
      beep(); setFlash(true)
      setTimeout(() => setFlash(false), 1300)
    }
  }, [resting, rem])

  return (
    <div className={`timer-bar${flash ? ' flash' : ''}`}>
      <div style={{ color: '#6b7280', fontSize: '0.8rem' }}>
        ⏱ <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{sessionStr}</span>
      </div>
      {resting ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn-icon" onClick={() => onAddRest(-30)}>−30</button>
          <span style={{ color: rem === 0 ? '#6ee7b7' : color, fontWeight: 700, fontSize: '1.1rem', minWidth: 56, textAlign: 'center' }}>
            {formatClock(rem)}
          </span>
          <button className="btn-icon" onClick={() => onAddRest(30)}>+30</button>
          <button className="btn-secondary" style={{ fontSize: '0.75rem', padding: '4px 10px' }} onClick={onSkipRest}>Skip</button>
        </div>
      ) : (
        <span style={{ color: '#4a5568', fontSize: '0.75rem' }}>Log a set to start rest timer</span>
      )}
    </div>
  )
}
