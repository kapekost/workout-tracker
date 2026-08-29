import { colors, type } from '../lib/theme'

export default function StatPair({ label, value, align = 'left', valueColor = colors.text }) {
  return (
    <div style={{ textAlign: align }}>
      <p style={{
        color: colors.muted,
        fontSize: type.size.sm,
        fontWeight: type.weight.bold,
        letterSpacing: type.labelTracking,
        textTransform: 'uppercase',
      }}>
        {label}
      </p>
      <p style={{
        color: valueColor,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: type.size.title,
        fontWeight: type.weight.bold,
        marginTop: 4,
      }}>
        {value}
      </p>
    </div>
  )
}
