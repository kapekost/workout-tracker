import { useState, useEffect } from 'react'
import { api } from '../api'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#111120', border: '1px solid #1e1e32', borderRadius: 8, padding: '8px 14px' }}>
      <p style={{ color: '#6b7280', fontSize: '0.75rem', marginBottom: 4 }}>{label}</p>
      <p style={{ color: '#6ee7b7', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: '1rem' }}>
        {payload[0].value} kg
      </p>
    </div>
  )
}

export default function Progress() {
  const [exercises, setExercises] = useState([])
  const [selected, setSelected] = useState(null)
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get('/progress').then(setExercises).catch(() => {})
  }, [])

  useEffect(() => {
    if (!selected) return
    setLoading(true)
    api.get(`/progress/${selected}`).then(d => {
      setData(d.map(r => ({ date: r.date.slice(5), weight: r.max_weight })))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [selected])

  const selectedName = exercises.find(e => e.exercise_id === selected)?.exercise_name

  const pr = data.length ? Math.max(...data.map(d => d.weight)) : null

  return (
    <div style={{ paddingTop: 32 }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 4 }}>Progress</h1>
      <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: 28 }}>Max weight per session</p>

      {exercises.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <p style={{ color: '#6b7280' }}>No data yet.</p>
          <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginTop: 4 }}>Complete a workout to see progress here.</p>
        </div>
      ) : (
        <>
          {/* Exercise picker */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
            {exercises.map(ex => (
              <button key={ex.exercise_id}
                onClick={() => setSelected(ex.exercise_id)}
                style={{
                  padding: '7px 14px', borderRadius: 100,
                  border: '1px solid',
                  borderColor: selected === ex.exercise_id ? '#6ee7b7' : '#1e1e32',
                  background: selected === ex.exercise_id ? '#6ee7b71a' : '#111120',
                  color: selected === ex.exercise_id ? '#6ee7b7' : '#9ca3af',
                  fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer'
                }}>
                {ex.exercise_name}
              </button>
            ))}
          </div>

          {/* Chart */}
          {selected && (
            <div>
              {/* PR badge */}
              {pr && (
                <div className="card" style={{ padding: '16px 20px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ color: '#6b7280', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Personal Record</p>
                    <p style={{ color: '#fbbf24', fontFamily: 'JetBrains Mono, monospace', fontSize: '1.75rem', fontWeight: 700, marginTop: 4 }}>
                      🏆 {pr} kg
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ color: '#6b7280', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Sessions</p>
                    <p style={{ color: '#fff', fontFamily: 'JetBrains Mono, monospace', fontSize: '1.75rem', fontWeight: 700, marginTop: 4 }}>
                      {data.length}
                    </p>
                  </div>
                </div>
              )}

              <div className="card" style={{ padding: '20px 8px 12px 0' }}>
                <p style={{ color: '#9ca3af', fontSize: '0.8rem', fontWeight: 600, paddingLeft: 20, marginBottom: 16 }}>{selectedName}</p>
                {loading ? (
                  <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>Loading…</div>
                ) : data.length < 2 ? (
                  <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '0.875rem' }}>
                    Log at least 2 sessions to see a trend
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={data} margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e1e32" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} width={42} unit="kg" />
                      <Tooltip content={<CustomTooltip />} />
                      <Line type="monotone" dataKey="weight" stroke="#6ee7b7" strokeWidth={2.5}
                        dot={{ fill: '#6ee7b7', r: 4, strokeWidth: 0 }}
                        activeDot={{ r: 6, fill: '#6ee7b7' }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
