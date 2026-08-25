import { useLocation, useNavigate } from 'react-router-dom'
import Eyebrow from './Eyebrow'
import { colors, type } from '../lib/theme'

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
      background: colors.card, borderTop: `1px solid ${colors.border}`,
      display: 'flex', paddingTop: 8, paddingLeft: 0, paddingRight: 0,
      // env(safe-area-inset-bottom) is 0 on a non-notched device, so this
      // renders identically to the old flat 20px there; on a notched
      // device it grows to clear the home-indicator area, same pattern
      // TimerBar's own `bottom` offset already uses (index.css). Combined
      // rendered height feeds --navbar-height (index.css :root) — keep
      // that in sync if this ever changes.
      paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
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
              color: isActive ? colors.mint : colors.muted
            }}>{tab.icon}</span>
            <Eyebrow color={isActive ? colors.mint : colors.muted} style={{ fontWeight: type.weight.semibold }}>
              {tab.label}
            </Eyebrow>
          </button>
        )
      })}
    </nav>
  )
}
