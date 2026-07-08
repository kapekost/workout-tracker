import { useEffect, useRef, useState } from 'react'
import { remainingSeconds, elapsedSeconds, formatClock } from '../lib/timer'
import { track } from '../lib/analytics'

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

export default function TimerBar({ sessionStartMs, restStartMs, restTargetSec, onAddRest, onSkipRest, color, wakeLockHeld, paused, pausedRem, onTogglePause }) {
  const [now, setNow] = useState(Date.now())
  const [flash, setFlash] = useState(false)
  const firedRef = useRef(false)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // reset the "done" latch whenever a new rest period starts
  useEffect(() => {
    if (restStartMs == null) return // pause/end — don't reset the beep latch
    firedRef.current = false; setFlash(false)
  }, [restStartMs])

  const sessionStr = formatClock(elapsedSeconds(sessionStartMs, now))
  const resting = restStartMs != null || paused
  const rem = paused ? (pausedRem ?? 0) : (restStartMs != null ? remainingSeconds(restStartMs, restTargetSec, now) : 0)

  useEffect(() => {
    if (resting && rem === 0 && !firedRef.current) {
      firedRef.current = true
      track('rest_actual_vs_target', { target: restTargetSec, actual: restStartMs != null ? elapsedSeconds(restStartMs, now) : restTargetSec })
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      beep(); navigator.vibrate?.([300,150,300])
      if (!reduce) { setFlash(true); setTimeout(() => setFlash(false), 1300) }
    }
  }, [resting, rem])

  // The controls row always renders at the same size — disabled/dimmed when not resting —
  // so logging a set never resizes the bar or moves a button.
  return (
    <div className={`timer-bar${flash ? ' flash' : ''}`}>
      <div style={{ color: '#9ca3af', fontSize: '0.8rem' }}>
        ⏱ <span style={{ color: '#9ca3af', fontWeight: 700 }}>{sessionStr}</span>
        {wakeLockHeld && (
          <span style={{ color: '#6ee7b7', fontSize: '0.6rem', fontWeight: 700, marginLeft: 8 }}>🔆 On</span>
        )}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        opacity: resting ? 1 : 0.4,
        pointerEvents: resting ? 'auto' : 'none'
      }}>
        <button className="btn-icon" disabled={!resting} aria-label="subtract 30 seconds" onClick={() => { track('rest_adjust', { delta: -30 }); onAddRest(-30) }}>−30</button>
        <div style={{ textAlign: 'center', minWidth: 88 }}>
          <div style={{ color: resting && rem === 0 ? '#6ee7b7' : '#9ca3af', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em' }}>
            {resting ? (rem === 0 ? 'GO' : 'REST') : 'REST'}
          </div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: '2.2rem', lineHeight: 1 }}>
            {formatClock(resting ? rem : 0)}
          </div>
        </div>
        <button className="btn-icon" disabled={!resting} aria-label="add 30 seconds" onClick={() => { track('rest_adjust', { delta: 30 }); onAddRest(30) }}>+30</button>
        <button className="btn-secondary" disabled={!resting} aria-label={paused ? 'resume rest timer' : 'pause rest timer'} style={{ minHeight: 44, fontSize: '0.75rem', padding: '4px 12px' }} onClick={onTogglePause}>{paused ? '▶' : '⏸'}</button>
        <button className="btn-secondary" disabled={!resting} aria-label="skip rest" style={{ minHeight: 44, fontSize: '0.75rem', padding: '4px 12px' }} onClick={() => { track('rest_skip'); onSkipRest() }}>Skip</button>
      </div>
    </div>
  )
}
