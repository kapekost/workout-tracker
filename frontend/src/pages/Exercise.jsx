import { useParams, useNavigate } from 'react-router-dom'
import { PLAN, DAY_COLORS, DAY_COLOR_FALLBACK } from '../data/workoutPlan'
import ExerciseDetails from '../components/ExerciseDetails'
import { colors, type } from '../lib/theme'

export default function Exercise() {
  const { workoutDay, exerciseId } = useParams()
  const nav = useNavigate()
  const plan = PLAN[workoutDay]
  const ex = plan?.exercises.find(e => e.id === exerciseId)
  const color = DAY_COLORS[workoutDay] ?? DAY_COLOR_FALLBACK

  if (!ex) return (
    <div style={{ padding: 24 }}>
      <button className="tap-target" onClick={() => nav(-1)} style={{ background: 'none', border: 'none', color: colors.mint, cursor: 'pointer', fontSize: '1rem', marginBottom: 16 }}>
        ← Back
      </button>
      <p style={{ color: colors.danger }}>Exercise not found.</p>
    </div>
  )

  return (
    <div style={{ paddingTop: 16 }}>
      {/* Back */}
      <button className="tap-target" onClick={() => nav(-1)}
        style={{ background: 'none', border: 'none', color, cursor: 'pointer', fontSize: '0.9rem',
          fontWeight: type.weight.semibold, padding: 0, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 4 }}>
        ← Back to workout
      </button>

      {/* Title */}
      <h1 style={{ fontSize: type.size.title, fontWeight: type.weight.bold, marginBottom: 4 }}>{ex.name}</h1>
      {ex.alt && <p style={{ color: colors.muted2, fontSize: type.size.lg, marginBottom: 20 }}>{ex.alt}</p>}

      <ExerciseDetails ex={ex} color={color} />
    </div>
  )
}
