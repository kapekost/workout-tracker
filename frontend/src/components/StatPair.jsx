export default function StatPair({ label, value, valueColor, align = 'left' }) {
  return (
    <div style={{ textAlign: align }}>
      <p style={{ color: '#9ca3af', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {label}
      </p>
      <p style={{ color: valueColor ?? '#fff', fontFamily: 'JetBrains Mono, monospace', fontSize: '1.5rem', fontWeight: 700, marginTop: 4 }}>
        {value}
      </p>
    </div>
  )
}
