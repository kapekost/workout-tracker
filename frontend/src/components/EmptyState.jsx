import { colors, type, space } from '../lib/theme'

// The shared "nothing here yet" card. The title takes the inherited 1rem
// body size on purpose; only the subtitle is sized.
export default function EmptyState({ title, subtitle }) {
  return (
    <div className="card" style={{ padding: space.xxxl, textAlign: 'center' }}>
      <p style={{ color: colors.muted2 }}>{title}</p>
      {subtitle && (
        <p style={{ color: colors.muted, fontSize: type.size.md, marginTop: space.xs }}>{subtitle}</p>
      )}
    </div>
  )
}
