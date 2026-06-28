import { useLocation, useNavigate } from 'react-router-dom'

const tabs = [
  { path: '/', label: 'Home', icon: '⬡' },
  { path: '/progress', label: 'Progress', icon: '↗' },
  { path: '/history', label: 'History', icon: '☰' },
]

export default function NavBar() {
  const { pathname } = useLocation()
  const nav = useNavigate()
  const active = pathname === '/' ? '/' : tabs.find(t => pathname.startsWith(t.path) && t.path !== '/')?.path ?? '/'

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: '#111120', borderTop: '1px solid #1e1e32',
      display: 'flex', padding: '8px 0 20px',
      justifyContent: 'space-around', zIndex: 50
    }}>
      {tabs.map(tab => {
        const isActive = active === tab.path
        return (
          <button
            key={tab.path}
            onClick={() => nav(tab.path)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 3, background: 'none', border: 'none',
              cursor: 'pointer', padding: '4px 0', minHeight: 48
            }}
          >
            <span style={{
              fontSize: '1.35rem', lineHeight: 1,
              color: isActive ? '#6ee7b7' : '#9ca3af'
            }}>{tab.icon}</span>
            <span style={{
              fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.05em',
              color: isActive ? '#6ee7b7' : '#9ca3af',
              textTransform: 'uppercase'
            }}>{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
