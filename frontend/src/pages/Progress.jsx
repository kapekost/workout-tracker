import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import Skeleton from '../components/Skeleton'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import Chip from '../components/Chip'
import EmptyState from '../components/EmptyState'
import LoadError from '../components/LoadError'
import StatPair from '../components/StatPair'
import { colors, type, space, icon } from '../lib/theme'
import { IconTrophy, IconArrowTrendingUp } from '../icons'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '8px 14px' }}>
      <p style={{ color: colors.muted, fontSize: type.size.base, marginBottom: 4 }}>{label}</p>
      <p style={{ color: colors.accent, fontFamily: 'JetBrains Mono, monospace', fontWeight: type.weight.bold, fontSize: '1rem' }}>
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
  // Wave 1.1: two reads, two lies. A failed /progress left `exercises` empty and
  // the page said "No data yet. Complete a workout to see progress here."; a
  // failed /progress/{id} fell through to `data.length < 2` and said "Log at
  // least 2 sessions to see a trend". Neither had been asked anything.
  const [listError, setListError] = useState(false)
  const [dataError, setDataError] = useState(false)

  // Opens on a real chart instead of an empty screen: whichever exercise the
  // /progress response lists first (the same order the chip row renders) is
  // auto-selected once the list loads. `s ?? …` leaves a user's own tap
  // alone if one has already landed by the time this resolves.
  const loadList = useCallback(async () => {
    try {
      const d = await api.get('/progress')
      setExercises(d)
      setSelected(s => s ?? d[0]?.exercise_id)
      setListError(false)
    } catch {
      setListError(true)
    }
  }, [])

  const loadSeries = useCallback(async (id) => {
    setLoading(true)
    try {
      const d = await api.get(`/progress/${id}`)
      setData(d.map(r => ({
        date: r.date.slice(5), weight: r.max_weight,
        // Older responses carry only max_weight: treat it as a real single.
        single: r.best_single ?? r.max_weight, estimated: r.best_estimated ?? false,
        fromWeight: r.best_weight, fromReps: r.best_reps,
      })))
      setDataError(false)
    } catch {
      setDataError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadList() }, [loadList])

  useEffect(() => {
    if (!selected) return
    loadSeries(selected)
  }, [selected, loadSeries])

  const selectedName = exercises.find(e => e.exercise_id === selected)?.exercise_name
  // The record is the best single: a real one-rep lift, or the Epley estimate
  // when the best set had more reps. A tie goes to the heavier set.
  const prRow = data.length
    ? data.reduce((a, b) => (b.single > a.single || (b.single === a.single && b.weight > a.weight) ? b : a))
    : null
  const pr = prRow?.single ?? null
  // Derived straight from `data` (already state) rather than its own
  // effect/state -- data.length < 2 is the page's existing empty/sparse-data
  // branch (also gates the chart itself further down), so this stays null
  // there instead of computing a delta against a single point.
  const delta = data.length >= 2 ? data[data.length - 1].weight - data[0].weight : null

  return (
    <div style={{ paddingTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: type.size.title, fontWeight: type.weight.bold, letterSpacing: type.letterSpacing.tight, marginBottom: 4 }}>Progress</h1>
          <p style={{ color: colors.muted2, fontSize: type.size.lg }}>Max weight per session</p>
        </div>
        <button className="tap-target" onClick={() => nav('/personal-bests')}
          style={{ background: 'none', border: `1px solid ${colors.border}`, borderRadius: 100, color: colors.accent,
            fontSize: type.size.base, fontWeight: type.weight.semibold, cursor: 'pointer', padding: '7px 14px', whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'center', gap: 4 }}>
          <IconTrophy size={icon.body} /> PBs
        </button>
      </div>

      {listError ? (
        <LoadError what="your progress" onRetry={loadList} />
      ) : exercises.length === 0 ? <EmptyState title="No data yet." subtitle="Complete a workout to see progress here." /> : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
            {exercises.map(ex => (
              <Chip key={ex.exercise_id} onClick={() => setSelected(ex.exercise_id)} selected={selected === ex.exercise_id}>
                {ex.exercise_name}
              </Chip>
            ))}
          </div>

          {selected && (
            <div>
              {pr && (
                <div className="card" style={{ padding: `${space.xl}px ${space.xxl}px`, marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <StatPair label="Personal Record" value={<><IconTrophy size={icon.body} /> {pr} kg{prRow.estimated && <span style={{ color: colors.muted, fontSize: type.size.base, fontWeight: type.weight.semibold }}> est.</span>}</>} valueColor={colors.success} valueSize={type.size.display} />
                    <StatPair label="Sessions" value={data.length} align="right" />
                  </div>
                  {prRow.estimated && (
                    <p style={{ color: colors.muted, fontSize: type.size.base, marginTop: space.xs }}>
                      from {prRow.fromWeight} kg × {prRow.fromReps}
                    </p>
                  )}
                  {delta !== null && (
                    <p style={{
                      display: 'flex', alignItems: 'center', gap: space.xs, marginTop: space.sm,
                      color: delta > 0 ? colors.success : colors.muted, fontSize: type.size.base, fontWeight: type.weight.semibold,
                    }}>
                      <IconArrowTrendingUp size={icon.body} color={delta > 0 ? colors.success : colors.muted} />
                      {delta > 0 ? '+' : ''}{delta} kg since {data[0].date}
                    </p>
                  )}
                </div>
              )}

              <div className="card" style={{ padding: `${space.xxl}px ${space.sm}px ${space.md}px 0` }}>
                <p style={{ color: colors.muted, fontSize: type.size.md, fontWeight: type.weight.semibold, paddingLeft: 20, marginBottom: 16 }}>{selectedName}</p>
                {loading ? (
                  <div style={{ padding: '12px 20px' }}><Skeleton height={180} /></div>
                ) : dataError ? (
                  <div style={{ padding: '12px 20px' }}>
                    <LoadError what="this trend" onRetry={() => selected && loadSeries(selected)} />
                  </div>
                ) : data.length < 2 ? (
                  <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.muted, fontSize: type.size.lg }}>
                    Log at least 2 sessions to see a trend
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={data} margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={colors.border} vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: colors.muted, fontSize: 11 }} axisLine={false} tickLine={false} tickMargin={6} />
                      <YAxis tick={{ fill: colors.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={42} unit="kg" />
                      <Tooltip content={<CustomTooltip />} />
                      <Line type="monotone" dataKey="weight" stroke={colors.accent} strokeWidth={2.5}
                        dot={{ fill: colors.accent, r: 4, stroke: colors.card, strokeWidth: 2 }}
                        activeDot={{ r: 6, fill: colors.accent, stroke: colors.card, strokeWidth: 2 }} />
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
