import { useLocation } from 'react-router-dom'
import { colors, type } from '../lib/theme'

function pageLabel(pathname) {
  if (pathname === '/') return 'Home'
  if (pathname.startsWith('/progress')) return 'Progress'
  if (pathname.startsWith('/history')) return 'History'
  if (pathname.startsWith('/workout')) return 'Workout'
  if (pathname.startsWith('/exercise')) return 'Exercise'
  return ''
}

export default function TopBar() {
  const { pathname } = useLocation()
  const label = pageLabel(pathname)

  return (
    <div style={{
      background: colors.bg, borderBottom: `1px solid ${colors.border}`
    }}>
      <div className="max-w-md mx-auto" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px'
      }}>
        <span style={{ fontWeight: type.weight.bold, fontSize: '0.9rem', color: colors.text, letterSpacing: type.labelTracking }}>
          🏋 Gym Tracker
        </span>
        <span style={{
          color: colors.mint, fontSize: type.size.sm, fontWeight: type.weight.bold,
          letterSpacing: type.labelTracking, textTransform: 'uppercase'
        }}>
          {label}
        </span>
      </div>
    </div>
  )
}
