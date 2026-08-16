import { useState } from 'react'
import { PLAN, DAY_COLORS } from '../data/workoutPlan'
import { bestDayForMuscle } from '../lib/muscles'

// Shown at the point of display, never in settings and never behind an icon.
// The blind spot it discloses is one-directional: unlogged training can only
// make this estimate OVERSTATE freshness, never understate it.
export const DISCLOSURE =
  'Estimated from your logged training only — no sleep or HRV data, and it ' +
  "doesn't know about classes or training you log elsewhere. Trust how you " +
  'feel over this estimate.'

// Freshness is a MAGNITUDE, so the ring is a sequential encoding: one hue,
// dark to light, monotonic in lightness. Deliberately NOT red/amber/green —
// "Recently trained" is a fact, not a warning, and must not look like one.
// The bright end is the app's existing mint accent so the ring belongs to the
// same system as everything else on the page.
export function ringColor(freshness) {
  if (freshness === null || freshness === undefined) return 'rgb(42, 42, 62)'
  const t = Math.max(0, Math.min(1, freshness))
  const lerp = (a, b) => Math.round(a + (b - a) * t)
  return `rgb(${lerp(45, 110)}, ${lerp(95, 231)}, ${lerp(80, 183)})`
}

// Continuous and smoothly animatable — the ring is the part that moves. The
// TEXT is always a band label, never a numeral.
export function RecoveryRing({ freshness, size = 44 }) {
  const stroke = 4
  const r = (size - stroke - 2) / 2
  const circumference = 2 * Math.PI * r
  const filled = freshness === null || freshness === undefined
    ? 0
    : Math.max(0, Math.min(1, freshness))
  return (
    <svg className="recovery-ring" width={size} height={size}
      viewBox={`0 0 ${size} ${size}`} aria-hidden="true"
      style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="#1e1e32" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={ringColor(freshness)} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - filled)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 600ms ease-out, stroke 600ms ease-out' }} />
    </svg>
  )
}

function rawFact(group) {
  if (!group.lastDate) return `${group.label} — not trained yet.`
  return `${group.label} — last trained ${group.hoursSince}h ago, ` +
    `${group.fractionalSets} fractional sets.`
}

export function MuscleChip({ group, expanded, onToggle }) {
  return (
    <button className="tap-target" onClick={onToggle} aria-expanded={expanded}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        // Grid items default to min-width:auto, so the longest band label
        // ("Partly recovered (est.)") would force the track past its 1fr and
        // overflow the page sideways. Let the chip shrink and the label wrap.
        minWidth: 0,
        minHeight: 56, padding: '8px 10px', textAlign: 'left',
        background: expanded ? '#15152a' : 'none',
        border: '1px solid #1e1e32', borderRadius: 12, cursor: 'pointer',
        color: 'inherit',
      }}>
      <RecoveryRing freshness={group.freshness} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem' }}>
          {group.label}
        </span>
        <span style={{ display: 'block', color: '#9ca3af', fontSize: '0.7rem' }}>
          {group.band}
        </span>
      </span>
    </button>
  )
}

export default function MuscleGroupPicker({
  groups, lastTrainedByDay = {}, activeSession = null, starting = false, onStart,
}) {
  const [expandedId, setExpandedId] = useState(null)
  if (!groups?.length) return null

  const expanded = groups.find(g => g.id === expandedId) || null
  const bestDayId = expanded ? bestDayForMuscle(expanded.id, lastTrainedByDay) : null
  const bestDay = bestDayId ? PLAN[bestDayId] : null

  return (
    <div style={{ marginBottom: 24 }}>
      <p style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 700,
        letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
        Muscle groups
      </p>

      <div style={{ display: 'grid', gap: 8,
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        {groups.map(g => (
          <MuscleChip key={g.id} group={g} expanded={expandedId === g.id}
            onToggle={() => setExpandedId(expandedId === g.id ? null : g.id)} />
        ))}
      </div>

      {expanded && (
        <div className="card" style={{ padding: 16, marginTop: 12 }}>
          {/* The one line on this screen that is simply true. */}
          <p style={{ color: '#e5e7eb', fontSize: '0.8rem' }}>{rawFact(expanded)}</p>
          <p style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: 4 }}>
            {expanded.daysSinceLabel}
          </p>
          {bestDay && (
            <>
              <p style={{ color: '#9ca3af', fontSize: '0.75rem', marginTop: 12 }}>
                Best day for {expanded.label} → {bestDay.emoji} {bestDay.name}
              </p>
              {activeSession ? (
                <p style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: 8 }}>
                  Finish your current session first
                </p>
              ) : (
                <button className="btn-primary" disabled={starting}
                  onClick={() => onStart(bestDayId)}
                  style={{ background: DAY_COLORS[bestDayId] || '#9ca3af', marginTop: 12 }}>
                  {starting ? 'Starting…' : `Start ${bestDay.name}`}
                </button>
              )}
            </>
          )}
        </div>
      )}

      <p style={{ color: '#4b5563', fontSize: '0.7rem', marginTop: 12, lineHeight: 1.5 }}>
        {DISCLOSURE}
      </p>
    </div>
  )
}
