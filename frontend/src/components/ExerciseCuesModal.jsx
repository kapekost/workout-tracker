import { useEffect } from 'react'
import ExerciseDetails from './ExerciseDetails'
import { colors, type } from '../lib/theme'

// A bottom sheet instead of navigating to /exercise/:day/:id. That full
// page swap unmounted Workout.jsx, so checking a cue mid-set collapsed the
// exercise card and lost whatever weight/reps you'd already dialed in.
export default function ExerciseCuesModal({ ex, color, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div role="dialog" aria-modal="true" aria-label={`${ex.name} form cues`}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
      }}>
      <div onClick={e => e.stopPropagation()} className="max-w-md mx-auto"
        style={{
          background: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
          width: '100%', maxHeight: '85vh', overflowY: 'auto',
          padding: '20px 16px calc(24px + env(safe-area-inset-bottom))'
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <h2 style={{ fontSize: '1.3rem', fontWeight: type.weight.bold }}>{ex.name}</h2>
          <button className="btn-icon tap-target" aria-label="close" onClick={onClose}>×</button>
        </div>
        {ex.alt && <p style={{ color: colors.muted2, fontSize: type.size.md, marginBottom: 16 }}>{ex.alt}</p>}

        <ExerciseDetails ex={ex} color={color} />
      </div>
    </div>
  )
}
