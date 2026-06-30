import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useActiveSession } from '../lib/activeSession'
import { PLAN, DAY_COLORS } from '../data/workoutPlan'

export default function ResumeBanner() {
  const { active, discard } = useActiveSession()
  const { pathname } = useLocation()
  const nav = useNavigate()
  const [confirming, setConfirming] = useState(false)

  useEffect(() => { setConfirming(false) }, [active?.id])

  if (!active) return null
  if (pathname === `/workout/${active.id}`) return null

  const plan = PLAN[active.workout_day]
  const color = DAY_COLORS[active.workout_day] || '#9ca3af'
  const label = plan ? `${plan.emoji} ${plan.name}` : 'Workout'

  return (
    <div style={{ background: '#111120', borderTop: '1px solid #1e1e32', borderBottom: '1px solid #1e1e32' }}>
      <div className="max-w-md mx-auto" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 16px', gap: 12,
      }}>
        <button onClick={() => nav(`/workout/${active.id}`)} style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 10,
          background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left',
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
          <span style={{ color: '#e2e8f0', fontSize: '0.8rem', fontWeight: 600 }}>{label} in progress</span>
          <span style={{ color, fontSize: '0.8rem', fontWeight: 700, marginLeft: 'auto' }}>Resume ›</span>
        </button>
        {confirming ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#9ca3af', fontSize: '0.72rem' }}>Discard?</span>
            <button aria-label="confirm discard" onClick={() => discard(active.id)}
              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1rem' }}>✓</button>
            <button aria-label="cancel discard" onClick={() => setConfirming(false)}
              style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1rem' }}>✗</button>
          </div>
        ) : (
          <button aria-label="discard session" onClick={() => setConfirming(true)}
            style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.1rem', padding: '0 4px' }}>×</button>
        )}
      </div>
    </div>
  )
}
