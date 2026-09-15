import { useEffect, useState, useRef } from 'react'
import ExerciseDetails from './ExerciseDetails'
import { colors, type } from '../lib/theme'

const MODAL_EXIT_MS = 250

// A bottom sheet instead of navigating to /exercise/:day/:id. That full
// page swap unmounted Workout.jsx, so checking a cue mid-set collapsed the
// exercise card and lost whatever weight/reps you'd already dialed in.
export default function ExerciseCuesModal({ ex, color, onClose }) {
  const [phase, setPhase] = useState('entering') // 'entering' | 'open' | 'closing'
  const exitTimer = useRef(null)

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

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') requestClose() }
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
        className="cues-sheet"
        style={{
          background: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
          width: '100%', maxWidth: 'var(--content-max-width)', margin: '0 auto', maxHeight: '85vh', overflowY: 'auto',
          padding: '20px 16px calc(24px + env(safe-area-inset-bottom))',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: `transform ${MODAL_EXIT_MS}ms cubic-bezier(.32,.72,0,1)`,
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <h2 style={{ fontSize: '1.3rem', fontWeight: type.weight.bold }}>{ex.name}</h2>
          <button className="btn-icon tap-target" aria-label="Close" onClick={requestClose}>×</button>
        </div>
        {ex.alt && <p style={{ color: colors.muted2, fontSize: type.size.md, marginBottom: 16 }}>{ex.alt}</p>}

        <ExerciseDetails ex={ex} color={color} />
      </div>
    </div>
  )
}
