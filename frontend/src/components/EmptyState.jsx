import { colors, type, space } from '../lib/theme'

// Unifies the app's 3 near-identical "nothing here yet" cards (design-system
// inventory §3.2d), which disagreed on two properties. Padding: 32 wins (the
// 2-of-3 majority — Progress.jsx, History.jsx already agreed; Home.jsx's 24
// becomes 32). Subtitle size: 0.8rem wins (again the majority — Home.jsx,
// History.jsx; Progress.jsx's implicit 1rem becomes this explicit token).
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
