import { useState, useEffect } from 'react'
import { getDemoFrames } from '../lib/demos'
import { track } from '../lib/analytics'
import { colors, type } from '../lib/theme'

// Target / cues / demo body shared by the standalone Exercise page and the
// in-workout cues modal, so both stay in sync and only track views once.
export default function ExerciseDetails({ ex, color }) {
  const [demoFailed, setDemoFailed] = useState(false)
  const [frameIdx, setFrameIdx] = useState(0)
  const frames = getDemoFrames(ex.id)

  // Alternate the start/end frames to animate the movement.
  useEffect(() => {
    setFrameIdx(0)
    setDemoFailed(false)
    if (frames) track('demo_view', { exercise_id: ex.id })
    if (!frames || frames.length < 2) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const id = setInterval(() => setFrameIdx(i => (i + 1) % frames.length), 900)
    return () => clearInterval(id)
  }, [ex.id, frames])

  // Form cues render statically (no distinct "open" interaction) — track on mount/exercise change.
  useEffect(() => {
    track('cues_open', { exercise_id: ex.id })
  }, [ex.id])

  return (
    <>
      {/* Muscles */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
        {ex.muscles.map(m => (
          <span key={m} style={{
            background: colors.border, border: `1px solid ${color}33`,
            borderRadius: 100, padding: '5px 14px',
            fontSize: type.size.md, color, fontWeight: type.weight.semibold
          }}>{m}</span>
        ))}
      </div>

      {/* Target */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <p style={{ color: colors.muted2, fontSize: type.size.xs, fontWeight: type.weight.bold, letterSpacing: type.labelTracking, textTransform: 'uppercase', marginBottom: 12 }}>
          Target
        </p>
        <div style={{ display: 'flex', gap: 32 }}>
          <div>
            <p className="font-mono" style={{ fontSize: type.size.display, fontWeight: type.weight.bold, color, lineHeight: 1 }}>{ex.sets}</p>
            <p style={{ color: colors.muted2, fontSize: type.size.sm, marginTop: 2 }}>sets</p>
          </div>
          <div>
            <p className="font-mono" style={{ fontSize: type.size.display, fontWeight: type.weight.bold, color, lineHeight: 1 }}>{ex.repsLow}–{ex.repsHigh}</p>
            <p style={{ color: colors.muted2, fontSize: type.size.sm, marginTop: 2 }}>reps</p>
          </div>
        </div>
      </div>

      {/* Form cues */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <p style={{ color: colors.muted2, fontSize: type.size.xs, fontWeight: type.weight.bold, letterSpacing: type.labelTracking, textTransform: 'uppercase', marginBottom: 14 }}>
          Form cues
        </p>
        <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {ex.cues.map((cue, i) => (
            <li key={i} style={{
              display: 'flex', gap: 12, alignItems: 'flex-start',
              padding: '8px 0',
              borderBottom: i < ex.cues.length - 1 ? `1px solid ${colors.border}` : 'none'
            }}>
              <span className="font-mono" style={{ color, fontWeight: type.weight.bold, fontSize: type.size.base, minWidth: 20, paddingTop: 2 }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span style={{ color: colors.textSecondary, fontSize: type.size.lg, lineHeight: 1.5 }}>{cue}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Demo */}
      {frames && !demoFailed ? (
        <div className="card" style={{ padding: 12, marginBottom: 12 }}>
          <p style={{ color: colors.muted2, fontSize: type.size.xs, fontWeight: type.weight.bold, letterSpacing: type.labelTracking, textTransform: 'uppercase', marginBottom: 10 }}>
            Demo
          </p>
          {/* crossOrigin makes the SW see a real CORS response (jsDelivr sends
              ACAO:*) instead of an opaque one — opaque entries can't be cached
              safely (quota-padded ~7MB each, hide errors). */}
          <img src={frames[frameIdx % frames.length]} alt={`${ex.name} demonstration`} loading="lazy"
            crossOrigin="anonymous" onError={() => setDemoFailed(true)}
            style={{ width: '100%', borderRadius: 10, display: 'block', background: colors.border }} />
          <p style={{ color: colors.muted, fontSize: type.size.xs, textAlign: 'center', marginTop: 8 }}>
            Animated form demo · free-exercise-db (CC0)
          </p>
        </div>
      ) : (
        <>
          <a href={ex.ytUrl} target="_blank" rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              background: colors.border, border: `1px solid ${color}44`,
              borderRadius: 12, padding: '16px 20px', color,
              textDecoration: 'none', fontWeight: type.weight.bold, fontSize: '0.9rem'
            }}>
            <span style={{ fontSize: '1.4rem' }}>▶</span>
            Watch form demo on YouTube
          </a>
          <p style={{ color: colors.muted, fontSize: type.size.sm, textAlign: 'center', marginTop: 10 }}>
            Opens a YouTube search — pick a video from Jeff Nippard or Alan Thrall for evidence-based technique
          </p>
        </>
      )}
    </>
  )
}
