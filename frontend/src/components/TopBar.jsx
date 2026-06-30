import { useLocation } from 'react-router-dom'

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
      background: '#0a0a12', borderBottom: '1px solid #1e1e32'
    }}>
      <div className="max-w-md mx-auto" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px'
      }}>
        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fff', letterSpacing: '0.01em' }}>
          🏋 Gym Tracker
        </span>
        <span style={{
          color: '#6ee7b7', fontSize: '0.72rem', fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase'
        }}>
          {label}
        </span>
      </div>
    </div>
  )
}
