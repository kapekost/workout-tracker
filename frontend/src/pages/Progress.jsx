import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import Skeleton from '../components/Skeleton'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts'
import Eyebrow from '../components/Eyebrow'
import Chip from '../components/Chip'
import EmptyState from '../components/EmptyState'
import { colors, type } from '../lib/theme'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '8px 14px' }}>
      <p style={{ color: colors.muted2, fontSize: type.size.base, marginBottom: 4 }}>{label}</p>
      <p style={{ color: colors.mint, fontFamily: 'JetBrains Mono, monospace', fontWeight: type.weight.bold, fontSize: '1rem' }}>
        {payload[0].value} kg
      </p>
    </div>
  )
}

export default function Progress() {
  const nav = useNavigate()
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
    <div style={{ paddingTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: type.size.title, fontWeight: type.weight.bold, marginBottom: 4 }}>Progress</h1>
          <p style={{ color: colors.muted2, fontSize: type.size.lg }}>Max weight per session</p>
        </div>
        <button className="tap-target" onClick={() => nav('/personal-bests')}
          style={{ background: 'none', border: `1px solid ${colors.border}`, borderRadius: 100, color: colors.mint,
            fontSize: type.size.base, fontWeight: type.weight.semibold, cursor: 'pointer', padding: '7px 14px', whiteSpace: 'nowrap' }}>
          🏆 PBs
        </button>
      </div>

      {exercises.length === 0 ? (
        <EmptyState title="No data yet." subtitle="Complete a workout to see progress here." />
      ) : (
        <>
          {/* Exercise picker */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
            {exercises.map(ex => (
              <Chip key={ex.exercise_id} onClick={() => setSelected(ex.exercise_id)}
                selected={selected === ex.exercise_id}>
                {ex.exercise_name}
              </Chip>
            ))}
          </div>

          {/* Chart */}
          {selected && (
            <div>
              {/* PR badge */}
              {pr && (
                <div className="card" style={{ padding: '16px 20px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <Eyebrow>Personal Record</Eyebrow>
                    <p style={{ color: colors.amber, fontFamily: 'JetBrains Mono, monospace', fontSize: type.size.title, fontWeight: type.weight.bold, marginTop: 4 }}>
                      🏆 {pr} kg
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <Eyebrow>Sessions</Eyebrow>
                    <p style={{ color: colors.text, fontFamily: 'JetBrains Mono, monospace', fontSize: type.size.title, fontWeight: type.weight.bold, marginTop: 4 }}>
                      {data.length}
                    </p>
                  </div>
                </div>
              )}

              <div className="card" style={{ padding: '20px 8px 12px 0' }}>
                <p style={{ color: colors.muted, fontSize: type.size.md, fontWeight: type.weight.semibold, paddingLeft: 20, marginBottom: 16 }}>{selectedName}</p>
                {loading ? (
                  <div style={{ padding: '12px 20px' }}>
                    <Skeleton height={180} />
                  </div>
                ) : data.length < 2 ? (
                  <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.muted, fontSize: type.size.lg }}>
                    Log at least 2 sessions to see a trend
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={data} margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: colors.muted2, fontSize: 11 }} axisLine={false} tickLine={false} tickMargin={6} />
                      <YAxis tick={{ fill: colors.muted2, fontSize: 11 }} axisLine={false} tickLine={false} width={42} unit="kg" />
                      <Tooltip content={<CustomTooltip />} />
                      <Line type="monotone" dataKey="weight" stroke={colors.mint} strokeWidth={2.5}
                        dot={{ fill: colors.mint, r: 4, strokeWidth: 0 }}
                        activeDot={{ r: 6, fill: colors.mint }} />
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
