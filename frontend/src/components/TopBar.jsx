import { Link, useLocation } from 'react-router-dom'
import Eyebrow from './Eyebrow'
import { colors, type } from '../lib/theme'
import { useSession } from '../lib/session'

function pageLabel(pathname) {
  if (pathname === '/') return 'Home'
  if (pathname.startsWith('/progress')) return 'Progress'
  if (pathname.startsWith('/history')) return 'History'
  if (pathname.startsWith('/workout')) return 'Workout'
  if (pathname.startsWith('/exercise')) return 'Exercise'
  if (pathname.startsWith('/login')) return 'Log in'
  if (pathname.startsWith('/set-password')) return 'Password'
  return ''
}

const actionStyle = {
  fontSize: '0.8rem', fontWeight: type.weight.semibold, color: colors.mint,
  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  whiteSpace: 'nowrap', flexShrink: 0, textDecoration: 'none',
}

export default function TopBar() {
  const { pathname } = useLocation()
  const label = pageLabel(pathname)
  // Only a real session names anyone here. This used to fall back to
  // /profile/me -- the acting profile every anonymous write is attributed to
  // until #86 -- which was accurate but unreadable: the bar showed a username
  // and a "Log in" link at the same time, so the app looked logged in with no
  // way to log out. Reported by the owner within a day of #105 shipping.
  const { profile, signOut } = useSession()

  return (
    <div style={{
      background: colors.bg, borderBottom: `1px solid ${colors.border}`
    }}>
      <div className="page-shell" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px'
      }}>
        <span style={{
          fontWeight: type.weight.bold, fontSize: '0.9rem', color: colors.text,
          letterSpacing: type.labelTracking, whiteSpace: 'nowrap', flexShrink: 0
        }}>
          🏋 Gym Tracker
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {profile && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem',
              color: colors.text, minWidth: 0, overflow: 'hidden'
            }}>
              <span aria-hidden="true" style={{ flexShrink: 0 }}>{profile.icon || '👤'}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {profile.username}
              </span>
            </span>
          )}
          {profile
            ? (
              <button type="button" onClick={signOut} className="tap-target" style={actionStyle}>
                Log out
              </button>
            )
            : (
              <Link to="/login" className="tap-target" style={actionStyle}>
                Log in
              </Link>
            )}
          <Eyebrow color={colors.mint} size={type.size.sm}>{label}</Eyebrow>
        </div>
      </div>
    </div>
  )
}
