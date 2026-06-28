import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { PLAN, DAY_COLORS } from '../data/workoutPlan'
import { getDemoUrl } from '../lib/demos'

export default function Exercise() {
  const { workoutDay, exerciseId } = useParams()
  const nav = useNavigate()
  const plan = PLAN[workoutDay]
  const ex = plan?.exercises.find(e => e.id === exerciseId)
  const color = DAY_COLORS[workoutDay] ?? '#6ee7b7'
  const [demoFailed, setDemoFailed] = useState(false)
  const demoUrl = getDemoUrl(exerciseId)

  if (!ex) return (
    <div style={{ padding: 24 }}>
      <button onClick={() => nav(-1)} style={{ background: 'none', border: 'none', color: '#6ee7b7', cursor: 'pointer', fontSize: '1rem', marginBottom: 16 }}>
        ← Back
      </button>
      <p style={{ color: '#ef4444' }}>Exercise not found.</p>
    </div>
  )

  return (
    <div style={{ paddingTop: 24 }}>
      {/* Back */}
      <button onClick={() => nav(-1)}
        style={{ background: 'none', border: 'none', color, cursor: 'pointer', fontSize: '0.9rem',
          fontWeight: 600, padding: 0, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 4 }}>
        ← Back to workout
      </button>

      {/* Title */}
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 4 }}>{ex.name}</h1>
      {ex.alt && <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: 20 }}>{ex.alt}</p>}

      {/* Muscles */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
        {ex.muscles.map(m => (
          <span key={m} style={{
            background: '#1e1e32', border: `1px solid ${color}33`,
            borderRadius: 100, padding: '5px 14px',
            fontSize: '0.8rem', color, fontWeight: 600
          }}>{m}</span>
        ))}
      </div>

      {/* Target */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <p style={{ color: '#6b7280', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
          Target
        </p>
        <div style={{ display: 'flex', gap: 32 }}>
          <div>
            <p className="font-mono" style={{ fontSize: '2rem', fontWeight: 700, color, lineHeight: 1 }}>{ex.sets}</p>
            <p style={{ color: '#6b7280', fontSize: '0.7rem', marginTop: 2 }}>sets</p>
          </div>
          <div>
            <p className="font-mono" style={{ fontSize: '2rem', fontWeight: 700, color, lineHeight: 1 }}>{ex.repsLow}–{ex.repsHigh}</p>
            <p style={{ color: '#6b7280', fontSize: '0.7rem', marginTop: 2 }}>reps</p>
          </div>
        </div>
      </div>

      {/* Form cues */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <p style={{ color: '#6b7280', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
          Form cues
        </p>
        <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {ex.cues.map((cue, i) => (
            <li key={i} style={{
              display: 'flex', gap: 12, alignItems: 'flex-start',
              padding: '8px 0',
              borderBottom: i < ex.cues.length - 1 ? '1px solid #1e1e32' : 'none'
            }}>
              <span className="font-mono" style={{ color, fontWeight: 700, fontSize: '0.75rem', minWidth: 20, paddingTop: 2 }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span style={{ color: '#e2e8f0', fontSize: '0.875rem', lineHeight: 1.5 }}>{cue}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Demo */}
      {demoUrl && !demoFailed ? (
        <div className="card" style={{ padding: 12, marginBottom: 12 }}>
          <p style={{ color: '#6b7280', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
            Demo
          </p>
          <img src={demoUrl} alt={`${ex.name} demonstration`} loading="lazy"
            onError={() => setDemoFailed(true)}
            style={{ width: '100%', borderRadius: 10, display: 'block', background: '#1e1e32' }} />
        </div>
      ) : (
        <>
          <a href={ex.ytUrl} target="_blank" rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              background: '#1e1e32', border: `1px solid ${color}44`,
              borderRadius: 12, padding: '16px 20px', color,
              textDecoration: 'none', fontWeight: 700, fontSize: '0.9rem'
            }}>
            <span style={{ fontSize: '1.4rem' }}>▶</span>
            Watch form demo on YouTube
          </a>
          <p style={{ color: '#4a5568', fontSize: '0.7rem', textAlign: 'center', marginTop: 10 }}>
            Opens a YouTube search — pick a video from Jeff Nippard or Alan Thrall for evidence-based technique
          </p>
        </>
      )}
    </div>
  )
}
