import { useEffect, useState, useRef } from 'react'
import ExerciseDetails from './ExerciseDetails'
import { colors, type, icon } from '../lib/theme'
import { IconXMark } from '../icons'
import useBackToClose from '../lib/useBackToClose'

const MODAL_EXIT_MS = 250

// A bottom sheet instead of navigating to /exercise/:day/:id. That full
// page swap unmounted Workout.jsx, so checking a cue mid-set collapsed the
// exercise card and lost whatever weight/reps you'd already dialed in.
const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Keeps Tab inside the sheet. The sheet itself holds focus on open, so a Tab
// from there (or from outside it) lands on the first or last control.
function trapTab(e, sheet) {
  if (!sheet) return
  const items = [...sheet.querySelectorAll(FOCUSABLE)]
  if (!items.length) { e.preventDefault(); return }
  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement
  if (!sheet.contains(active) || active === sheet) {
    e.preventDefault()
    ;(e.shiftKey ? last : first).focus()
  } else if (e.shiftKey && active === first) {
    e.preventDefault(); last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault(); first.focus()
  }
}

export default function ExerciseCuesModal({ ex, color, onClose }) {
  const [phase, setPhase] = useState('entering') // 'entering' | 'open' | 'closing'
  const exitTimer = useRef(null)
  const sheetRef = useRef(null)
  useBackToClose(onClose)

  useEffect(() => {
    // setTimeout(fn, 0) is not a paint boundary -- the browser can resolve
    // styles once and never see the "before" state, so the sheet would
    // appear instantly instead of sliding in. A double rAF guarantees a
    // frame has actually been painted with the entering styles first.
    let inner
    const outer = requestAnimationFrame(() => { inner = requestAnimationFrame(() => setPhase('open')) })
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner) }
  }, [])

  function requestClose() {
    if (phase !== 'open') return // already closing (or never finished entering) -- ignore repeats
    setPhase('closing')
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    exitTimer.current = setTimeout(onClose, reduced ? 0 : MODAL_EXIT_MS)
  }

  // Focus enters the sheet on open and returns to whatever opened it.
  useEffect(() => {
    const opener = document.activeElement
    sheetRef.current?.focus()
    return () => opener?.focus?.()
  }, [])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') requestClose()
      if (e.key === 'Tab') trapTab(e, sheetRef.current)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  useEffect(() => () => clearTimeout(exitTimer.current), [])

  const visible = phase === 'open'

  return (
    <div role="dialog" aria-modal="true" aria-label={`${ex.name} form cues`}
      onClick={requestClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        opacity: visible ? 1 : 0, transition: `opacity ${MODAL_EXIT_MS}ms ease`,
        pointerEvents: phase === 'open' ? 'auto' : 'none',
      }}
      className="cues-overlay">
      <div onClick={e => e.stopPropagation()}
        ref={sheetRef} tabIndex={-1}
        className="cues-sheet"
        style={{
          background: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
          width: '100%', maxWidth: 'var(--content-max-width)', margin: '0 auto', maxHeight: '85vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', outline: 'none',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: `transform ${MODAL_EXIT_MS}ms cubic-bezier(.32,.72,0,1)`,
        }}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 16px 8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
            <h2 style={{ fontSize: '1.3rem', fontWeight: type.weight.bold }}>{ex.name}</h2>
            <button className="btn-icon tap-target" aria-label="Close" onClick={requestClose}><IconXMark size={icon.control} /></button>
          </div>
          {ex.alt && <p style={{ color: colors.muted2, fontSize: type.size.md, marginBottom: 16 }}>{ex.alt}</p>}

          <ExerciseDetails ex={ex} color={color} />
        </div>
        {/* Pinned below the scroll area so it stays in thumb reach. */}
        <div style={{ padding: '8px 16px calc(16px + env(safe-area-inset-bottom))' }}>
          <button className="btn-secondary tap-target" style={{ width: '100%' }} onClick={requestClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
