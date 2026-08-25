import { useState, useEffect, useMemo } from 'react'
import { api } from '../api'
import { PLAN } from '../data/workoutPlan'
import Skeleton from '../components/Skeleton'
import Toast from '../components/Toast'
import EmptyState from '../components/EmptyState'
import DayAccent from '../components/DayAccent'
import { useToast } from '../lib/useToast'
import { track } from '../lib/analytics'
import { colors, type } from '../lib/theme'

function sessionDuration(s) {
  if (!s.completed || !s.ended_at || !s.created_at) return null
  const ms = Date.parse(s.ended_at.replace(' ', 'T') + 'Z') - Date.parse(s.created_at.replace(' ', 'T') + 'Z')
  if (ms <= 0) return null
  const m = Math.round(ms / 60000)
  return m < 60 ? `${m} min` : `${Math.floor(m/60)}h ${m%60}m`
}

export function SessionDetail({ detail, confirmId, sessionId, onDelete }) {
  const grouped = useMemo(() => {
    const g = {}
    if (detail?.sets) {
      detail.sets.forEach(st => {
        if (!g[st.exercise_name]) g[st.exercise_name] = []
        g[st.exercise_name].push(st)
      })
    }
    return g
  }, [detail])

  if (!detail) return <p style={{ color: colors.muted, fontSize: type.size.lg }}>Loading…</p>

  const groups = Object.entries(grouped)

  return (
    <>
      {groups.length === 0 ? (
        <p style={{ color: colors.muted, fontSize: type.size.lg, marginBottom: 8 }}>No sets logged in this session.</p>
      ) : groups.map(([name, exSets]) => {
        const best = Math.max(...exSets.map(s => s.weight_kg))
        return (
          <div key={name} style={{ marginBottom: 14 }}>
            <p style={{ color: colors.muted, fontSize: type.size.md, fontWeight: type.weight.semibold, marginBottom: 6 }}>{name}</p>
            {exSets.map(st => (
              <div key={st.id} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '5px 0', borderBottom: `1px solid ${colors.divider}`
              }}>
                <span style={{ color: colors.muted, fontFamily: 'JetBrains Mono, monospace', fontSize: type.size.base }}>Set {st.set_number}</span>
                <span className="font-mono" style={{
                  fontSize: type.size.lg, fontWeight: type.weight.bold,
                  color: st.weight_kg === best ? colors.amber : colors.textSecondary
                }}>
                  {st.weight_kg}kg × {st.reps}
                  {st.weight_kg === best && ' 🏆'}
                </span>
              </div>
            ))}
          </div>
        )
      })}
      <button className="tap-target" onClick={() => onDelete(sessionId)}
        style={{ background: 'none', border: `1px solid ${colors.dangerBg}`, borderRadius: 8,
          color: colors.danger, cursor: 'pointer', padding: '8px 16px', fontSize: type.size.base,
          fontWeight: type.weight.semibold, marginTop: 8 }}>
        {confirmId === sessionId ? 'Tap again to confirm' : 'Delete session'}
      </button>
    </>
  )
}

export default function History() {
  const [sessions, setSessions] = useState([])
  const [details, setDetails] = useState({})
  const [expanded, setExpanded] = useState(null)
  const [loading, setLoading] = useState(true)
  const [confirmId, setConfirmId] = useState(null)
  const { toast, showToast } = useToast()

  useEffect(() => {
    api.get('/sessions').then(s => { setSessions(s); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  async function toggle(id) {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    if (!details[id]) {
      try {
        const s = await api.get(`/sessions/${id}`)
        setDetails(prev => ({ ...prev, [id]: s }))
      } catch {}
    }
  }

  async function deleteSession(id) {
    if (confirmId !== id) {
      setConfirmId(id)
      setTimeout(() => setConfirmId(c => (c === id ? null : c)), 3000)
      return
    }
    setConfirmId(null)
    try {
      await api.delete(`/sessions/${id}`)
      track('session_delete')
      setSessions(prev => prev.filter(s => s.id !== id))
      if (expanded === id) setExpanded(null)
    } catch {
      showToast('Failed to delete', 'error')
    }
  }

  if (loading) return (
    <div style={{ paddingTop: 32 }}>
      <Skeleton height={72} style={{ marginBottom: 10 }} />
      <Skeleton height={72} style={{ marginBottom: 10 }} />
      <Skeleton height={72} />
    </div>
  )

  return (
    <div style={{ paddingTop: 16 }}>
      <Toast toast={toast} />
      <h1 style={{ fontSize: type.size.title, fontWeight: type.weight.bold, marginBottom: 4 }}>History</h1>
      <p style={{ color: colors.muted2, fontSize: type.size.lg, marginBottom: 28 }}>
        {sessions.length} session{sessions.length !== 1 ? 's' : ''} logged
      </p>

      {sessions.length === 0 ? (
        <EmptyState title="No sessions yet." subtitle="Your workout history will appear here." />
      ) : sessions.map(s => {
        const plan = PLAN[s.workout_day]
        const isOpen = expanded === s.id
        const detail = details[s.id]

        return (
          <div key={s.id} className="card" style={{ marginBottom: 10, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}
              onClick={() => toggle(s.id)}>
              <DayAccent day={s.workout_day} shape="bar" />
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: type.weight.semibold, fontSize: '0.95rem' }}>
                  {plan?.emoji} {plan?.name ?? s.workout_day}
                </p>
                <p style={{ color: colors.muted, fontSize: type.size.base, marginTop: 2 }}>
                  {s.date} {s.completed ? '· ✓ completed' : '· in progress'}
                  {sessionDuration(s) ? <> · <span style={{ whiteSpace: 'nowrap' }}>⏱ {sessionDuration(s)}</span></> : ''}
                </p>
              </div>
              <span style={{ color: colors.muted, fontSize: '1.1rem' }}>{isOpen ? '∧' : '∨'}</span>
            </div>

            {isOpen && (
              <div style={{ borderTop: `1px solid ${colors.border}`, padding: '14px 16px' }}>
                <SessionDetail detail={detail} confirmId={confirmId} sessionId={s.id} onDelete={deleteSession} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
