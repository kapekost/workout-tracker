import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import Eyebrow from '../components/Eyebrow'
import Toast from '../components/Toast'
import { usePlan } from '../lib/planContext'
import { useToast } from '../lib/useToast'
import { colors, type, space, icon } from '../lib/theme'
import { IconArrowLeft } from '../icons'

const textArea = {
  width: '100%', background: colors.border, border: 'none', borderRadius: 8, color: colors.textSecondary,
  fontSize: '1rem', padding: 8, resize: 'vertical', minHeight: 140,
}

// Chat apps wrap JSON in prose or a code fence even when told not to.
function parseReply(text) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}

const hasChanges = p => p.details.length > 0

function counts(p) {
  return [
    p.exercises_added && `${p.exercises_added} added`,
    p.exercises_modified && `${p.exercises_modified} modified`,
    p.exercises_removed && `${p.exercises_removed} removed`,
  ].filter(Boolean).join(' · ') || 'No changes'
}

export default function PlanAI() {
  const nav = useNavigate()
  const { retry } = usePlan()
  const { toast, showToast } = useToast()
  const [manual, setManual] = useState(null)
  const [reply, setReply] = useState('')
  const [preview, setPreview] = useState(null) // { envelope, result } of the last good preview
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const previewRef = useRef(null)
  const [busy, setBusy] = useState(false)
  // State lags a render, so a second tap in the same frame would still see busy=false.
  const inFlight = useRef(false)

  // The result lands below the keyboard on a phone, so bring it into view.
  useEffect(() => {
    if (preview) previewRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [preview])

  async function run(fn) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    try {
      await fn()
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const copy = () => run(async () => {
    setManual(null)
    let text
    try {
      const { prompt_template, ...data } = await api.get('/plan/export')
      text = `${prompt_template}\n\n${JSON.stringify(data, null, 2)}`
    } catch {
      showToast("Couldn't load your data. Try again.", 'error')
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      showToast('Copied')
    } catch {
      setManual(text)
    }
  })

  function edit(value) {
    setDone(false)
    setReply(value)
    setPreview(null)
    setError(null)
  }

  const check = () => run(async () => {
    setPreview(null)
    const envelope = parseReply(reply)
    if (!envelope) {
      setError("That reply isn't valid JSON, or it was cut off. Paste only the AI's JSON answer.")
      return
    }
    try {
      setPreview({ envelope, result: await api.post('/plan/update', { envelope, confirm: false }) })
      setError(null)
    } catch (err) {
      setError(err.detail ?? "Couldn't check that reply. Try again.")
    }
  })

  const confirm = () => run(async () => {
    try {
      await api.post('/plan/update', { envelope: preview.envelope, confirm: true })
    } catch (err) {
      if (err.status >= 400 && err.status < 500) {
        setError(`${err.detail ?? "Couldn't save your plan."} Your plan is unchanged.`)
      } else {
        // No answer or a server error: the write may have landed, so show the real plan.
        retry()
        setError("Couldn't confirm. Check your plan before trying again.")
      }
      return
    }
    retry()
    setReply('')
    setPreview(null)
    setError(null)
    setDone(true)
  })

  return (
    <div style={{ paddingTop: 16 }}>
      <Toast toast={toast} />
      <button className="tap-target" onClick={() => nav('/plan')}
        style={{ background: 'none', border: 'none', color: colors.accent, fontSize: type.size.md,
          fontWeight: type.weight.semibold, cursor: 'pointer', padding: 0, marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 4 }}>
        <IconArrowLeft size={icon.body} /> Your plan
      </button>
      <h1 style={{ fontSize: type.size.title, fontWeight: type.weight.bold, letterSpacing: type.letterSpacing.tight, marginBottom: 4 }}>Update with AI</h1>
      <p style={{ color: colors.muted2, fontSize: type.size.lg, marginBottom: 6 }}>
        Paste your data into ChatGPT, Claude or Gemini, then bring the reply back here.
      </p>
      <p style={{ color: colors.muted, fontSize: type.size.base, marginBottom: 20 }}>
        Copies your plan, last 20 workouts, personal bests and exercise notes. It goes to whichever chatbot you paste it into, under that service's terms. Check your notes first.
      </p>

      <div className="card" style={{ padding: space.xl, marginBottom: 14 }}>
        <Eyebrow style={{ marginBottom: space.md }}>1. Copy</Eyebrow>
        <button type="button" className="btn-primary" onClick={copy} disabled={busy}>Copy prompt + your data</button>
        {manual && (
          <>
            <p style={{ color: colors.muted2, fontSize: type.size.md, margin: `${space.md}px 0 ${space.sm}px` }}>
              Copying was blocked. Select all and copy this by hand.
            </p>
            <textarea aria-label="Prompt and data" readOnly value={manual} style={{ ...textArea }} onFocus={e => e.target.select()} />
          </>
        )}
      </div>

      <div className="card" style={{ padding: space.xl }}>
        <Eyebrow style={{ marginBottom: space.md }}>2. Paste the reply</Eyebrow>
        <textarea aria-label="Reply from your AI" value={reply} onChange={e => edit(e.target.value)} style={{ ...textArea }} />
        <button type="button" onClick={() => edit('')} disabled={!reply}
          style={{ background: 'none', border: 'none', color: reply ? colors.accent : colors.muted, cursor: reply ? 'pointer' : 'default',
            fontSize: type.size.md, padding: `${space.sm}px 0` }}>Clear</button>
        <button type="button" className="btn-secondary" onClick={check} disabled={busy || !reply.trim()}
          style={{ width: '100%', marginTop: space.md }}>Preview</button>
        {!reply.trim() && (
          <p style={{ color: colors.muted, fontSize: type.size.base, marginTop: space.sm }}>Paste a reply to enable.</p>
        )}

        {error && (
          <p role="alert" style={{ color: colors.danger, fontSize: type.size.md, marginTop: space.md }}>{error}</p>
        )}

        {done && (
          <div role="status" style={{ marginTop: space.lg }}>
            <p style={{ fontWeight: type.weight.semibold, marginBottom: space.md }}>Plan updated</p>
            <button type="button" className="btn-secondary" onClick={() => nav('/plan')} style={{ width: '100%' }}>View plan</button>
          </div>
        )}

        {preview && (
          <div ref={previewRef} role="status" style={{ marginTop: space.lg }}>
            <p style={{ fontWeight: type.weight.semibold, marginBottom: space.sm }}>{counts(preview.result)}</p>
            {preview.result.ai_summary && (
              <p style={{ color: colors.muted2, fontSize: type.size.md, marginBottom: space.sm }}>{preview.result.ai_summary}</p>
            )}
            <ul style={{ listStyle: 'none', padding: 0, margin: `0 0 ${space.lg}px`, fontSize: type.size.md }}>
              {preview.result.details.map((d, i) => <li key={i} style={{ padding: '4px 0' }}>{d}</li>)}
            </ul>
            {hasChanges(preview.result) && (
              <button type="button" className="btn-primary" onClick={confirm} disabled={busy}>Confirm</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
