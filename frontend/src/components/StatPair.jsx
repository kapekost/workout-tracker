import Eyebrow from './Eyebrow'
import { colors, type, space } from '../lib/theme'

// The one component that ignored theme.js entirely (2026-09-06 UI review,
// item 17) -- '#9ca3af', '#fff', '0.75rem', 700 and '0.08em' were hardcoded
// here, and the label paragraph was a byte-for-byte reimplementation of
// Eyebrow. Only Progress.jsx's PR/Sessions row uses this; both call sites
// pass no `size`/`color` override for the label, so this keeps rendering
// identically to before.
export default function StatPair({ label, value, valueColor, align = 'left' }) {
  return (
    <div style={{ textAlign: align }}>
      <Eyebrow color={colors.muted} size={type.size.base}>{label}</Eyebrow>
      <p style={{
        color: valueColor ?? colors.text, fontFamily: 'JetBrains Mono, monospace',
        fontSize: '1.5rem', fontWeight: type.weight.bold, marginTop: space.xs,
      }}>
        {value}
      </p>
    </div>
  )
}
