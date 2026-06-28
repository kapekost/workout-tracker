import { useState, useEffect } from 'react'
import { api } from '../api'
import { PLAN, DAY_COLORS } from '../data/workoutPlan'

export default function History() {
  const [sessions, setSessions] = useState([])
  const [details, setDetails] = useState({})
  const [expanded, setExpanded] = useState(null)
  const [loading, setLoading] = useState(true)

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
    if (!confirm('Delete this session?')) return
    try {
      await api.delete(`/sessions/${id}`)
      setSessions(prev => prev.filter(s => s.id !== id))
      if (expanded === id) setExpanded(null)
    } catch { alert('Failed to delete.') }
  }

  if (loading) return <div style={{ paddingTop: 80, textAlign: 'center', color: '#4a5568' }}>Loading…</div>

  return (
    <div style={{ paddingTop: 32 }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 4 }}>History</h1>
      <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: 28 }}>
        {sessions.length} session{sessions.length !== 1 ? 's' : ''} logged
      </p>

      {sessions.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <p style={{ color: '#6b7280' }}>No sessions yet.</p>
          <p style={{ color: '#4a5568', fontSize: '0.8rem', marginTop: 4 }}>Your workout history will appear here.</p>
        </div>
      ) : sessions.map(s => {
        const plan = PLAN[s.workout_day]
        const color = DAY_COLORS[s.workout_day] ?? '#6ee7b7'
        const isOpen = expanded === s.id
        const detail = details[s.id]

        // Group sets by exercise for detail view
        const grouped = {}
        if (detail?.sets) {
          detail.sets.forEach(st => {
            if (!grouped[st.exercise_name]) grouped[st.exercise_name] = []
            grouped[st.exercise_name].push(st)
          })
        }

        return (
          <div key={s.id} className="card" style={{ marginBottom: 10, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}
              onClick={() => toggle(s.id)}>
              <div style={{
                width: 8, height: 36, borderRadius: 4, background: color, flexShrink: 0
              }} />
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                  {plan?.emoji} {plan?.name ?? s.workout_day}
                </p>
                <p style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: 2 }}>
                  {s.date} {s.completed ? '· ✓ completed' : '· in progress'}
                </p>
              </div>
              <span style={{ color: '#4a5568', fontSize: '1.1rem' }}>{isOpen ? '∧' : '∨'}</span>
            </div>

            {isOpen && (
              <div style={{ borderTop: '1px solid #1e1e32', padding: '14px 16px' }}>
                {!detail ? (
                  <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>Loading…</p>
                ) : Object.keys(grouped).length === 0 ? (
                  <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>No sets logged in this session.</p>
                ) : (
                  <>
                    {Object.entries(grouped).map(([name, exSets]) => {
                      const best = Math.max(...exSets.map(s => s.weight_kg))
                      return (
                        <div key={name} style={{ marginBottom: 14 }}>
                          <p style={{ color: '#9ca3af', fontSize: '0.8rem', fontWeight: 600, marginBottom: 6 }}>{name}</p>
                          {exSets.map(st => (
                            <div key={st.id} style={{
                              display: 'flex', justifyContent: 'space-between',
                              padding: '5px 0', borderBottom: '1px solid #1a1a2e'
                            }}>
                              <span style={{ color: '#4a5568', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.78rem' }}>Set {st.set_number}</span>
                              <span className="font-mono" style={{
                                fontSize: '0.85rem', fontWeight: 700,
                                color: st.weight_kg === best ? '#fbbf24' : '#e2e8f0'
                              }}>
                                {st.weight_kg}kg × {st.reps}
                                {st.weight_kg === best && ' 🏆'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </>
                )}
                <button onClick={() => deleteSession(s.id)}
                  style={{ background: 'none', border: '1px solid #2a1a1a', borderRadius: 8,
                    color: '#ef4444', cursor: 'pointer', padding: '8px 16px', fontSize: '0.78rem',
                    fontWeight: 600, marginTop: 8 }}>
                  Delete session
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
