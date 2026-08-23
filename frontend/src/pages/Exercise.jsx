import { useParams, useNavigate } from 'react-router-dom'
import { PLAN, DAY_COLORS } from '../data/workoutPlan'
import ExerciseDetails from '../components/ExerciseDetails'

export default function Exercise() {
  const { workoutDay, exerciseId } = useParams()
  const nav = useNavigate()
  const plan = PLAN[workoutDay]
  const ex = plan?.exercises.find(e => e.id === exerciseId)
  const color = DAY_COLORS[workoutDay] ?? '#6ee7b7'

  if (!ex) return (
    <div style={{ padding: 24 }}>
      <button className="tap-target" onClick={() => nav(-1)} style={{ background: 'none', border: 'none', color: '#6ee7b7', cursor: 'pointer', fontSize: '1rem', marginBottom: 16 }}>
        ← Back
      </button>
      <p style={{ color: '#ef4444' }}>Exercise not found.</p>
    </div>
  )

  return (
    <div style={{ paddingTop: 16 }}>
      {/* Back */}
      <button className="tap-target" onClick={() => nav(-1)}
        style={{ background: 'none', border: 'none', color, cursor: 'pointer', fontSize: '0.9rem',
          fontWeight: 600, padding: 0, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 4 }}>
        ← Back to workout
      </button>

      {/* Title */}
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 4 }}>{ex.name}</h1>
      {ex.alt && <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: 20 }}>{ex.alt}</p>}

      <ExerciseDetails ex={ex} color={color} />
    </div>
  )
}
