import { useEffect, useRef, useState } from 'react'
import { remainingSeconds, elapsedSeconds, formatClock } from '../lib/timer'
import { playBeep } from '../lib/sound'
import { track } from '../lib/analytics'
import { colors, type, icon } from '../lib/theme'
import { IconPlay, IconPause } from '../icons'

export default function TimerBar({ restStartMs, restTargetSec, onAddRest, onSkipRest, color, paused, pausedRem, onTogglePause, hasLoggedSets = true }) {
  const [now, setNow] = useState(Date.now())
  const [flash, setFlash] = useState(false)
  const [announce, setAnnounce] = useState('')
  const firedRef = useRef(false)
  const pendingRef = useRef(false)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // reset the "done" latch whenever a new rest period starts
  useEffect(() => {
    if (restStartMs == null) return // pause/end — don't reset the beep latch
    firedRef.current = false; pendingRef.current = false; setFlash(false); setAnnounce('')
  }, [restStartMs])

  const resting = restStartMs != null || paused
  const rem = paused ? (pausedRem ?? 0) : (restStartMs != null ? remainingSeconds(restStartMs, restTargetSec, now) : 0)
  // Before the first set of the session, "READY / —:—" implies a timer
  // that's about to run, which isn't true yet — nothing has started it.
  // Once at least one set is logged this session, idle reverts to the
  // ordinary READY state between rests (existing behaviour, unchanged).
  const showIdleHint = !resting && !hasLoggedSets

  function signalEnd() {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    playBeep(); navigator.vibrate?.([300,150,300])
    if (!reduce) { setFlash(true); setTimeout(() => setFlash(false), 1300) }
  }

  useEffect(() => {
    if (resting && rem === 0 && !firedRef.current) {
      firedRef.current = true
      track('rest_actual_vs_target', { target: restTargetSec, actual: restStartMs != null ? elapsedSeconds(restStartMs, now) : restTargetSec })
      setAnnounce('Rest over')
      // Signal now (the beep may still be heard from a hidden tab) and, if the tab
      // is hidden, once more when it comes back, since the flash went unseen.
      signalEnd()
      if (document.hidden) pendingRef.current = true
    }
  }, [resting, rem])

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== 'visible') return
      setNow(Date.now())
      if (pendingRef.current) { pendingRef.current = false; signalEnd() }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // The controls row always renders at the same size — disabled when not resting —
  // so logging a set never resizes the bar or moves a button. Only the buttons dim (via :disabled); the label and clock keep full contrast.
  return (
    <div className={`timer-bar${flash ? ' flash' : ''}`}>
      <div role="status" className="sr-only">{announce}</div>
      <div className="timer-controls">
        <button className="btn-icon" disabled={!resting} aria-label="subtract 30 seconds" onClick={() => { track('rest_adjust', { delta: -30 }); onAddRest(-30) }}>-30s</button>
        <div className="rest-block">
          <div className="rest-label" style={{ color: !resting ? colors.muted2 : rem === 0 ? colors.accent : paused ? colors.text : colors.muted, fontWeight: paused ? type.weight.bold : undefined }}>
            {showIdleHint ? 'LOG A SET' : !resting ? 'READY' : paused ? 'PAUSED' : rem === 0 ? 'GO' : 'REST'}
          </div>
          <div className="rest-clock">
            {formatClock(resting ? rem : restTargetSec)}
          </div>
        </div>
        <button className="btn-icon" disabled={!resting} aria-label="add 30 seconds" onClick={() => { track('rest_adjust', { delta: 30 }); onAddRest(30) }}>+30s</button>
        <button className="btn-secondary timer-pill" disabled={!resting} aria-label={paused ? 'resume rest timer' : 'pause rest timer'} onClick={onTogglePause}>{paused ? <IconPlay size={icon.control} /> : <IconPause size={icon.control} />}</button>
        <button className="btn-secondary timer-pill" disabled={!resting} aria-label="skip rest" onClick={() => { track('rest_skip'); onSkipRest() }}>Skip</button>
      </div>
    </div>
  )
}
