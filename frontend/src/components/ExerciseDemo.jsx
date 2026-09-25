import { useState, useEffect } from 'react'
import { getDemoFrames } from '../lib/demos'
import { track } from '../lib/analytics'
import Eyebrow from './Eyebrow'
import { colors, type } from '../lib/theme'

export default function ExerciseDemo({ ex, color, showTitle = true, style = {}, children }) {
  const [demoFailed, setDemoFailed] = useState(false)
  const [frameIdx, setFrameIdx] = useState(0)
  const frames = getDemoFrames(ex.id)

  useEffect(() => {
    setFrameIdx(0)
    setDemoFailed(false)
    if (frames) track('demo_view', { exercise_id: ex.id, source: 'exercise_demo_component' })
    if (!frames || frames.length < 2) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const id = setInterval(() => setFrameIdx(i => (i + 1) % frames.length), 900)
    return () => clearInterval(id)
  }, [ex.id, frames])

  if (!frames || demoFailed) return children || null

  return (
    <div className="card" style={{ padding: 12, ...style }}>
      {showTitle && <Eyebrow style={{ marginBottom: 10 }}>Demo: {ex.name}</Eyebrow>}
      <img
        src={frames[frameIdx % frames.length]}
        alt={`${ex.name} demonstration`}
        loading="lazy"
        crossOrigin="anonymous"
        onError={() => setDemoFailed(true)}
        style={{ width: '100%', borderRadius: 10, display: 'block', background: colors.border }}
      />
      <p style={{ color: colors.muted, fontSize: type.size.xs, textAlign: 'center', marginTop: 8 }}>
        Animated form demo · free-exercise-db (CC0)
      </p>
    </div>
  )
}
