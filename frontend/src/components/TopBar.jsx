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
  return ''
}

// The auth screens carry their own <h1> and exactly one action, so the bar
// drops both its page label and its "Log in" link there. Printing "Log in"
// next to an eyebrow reading "LOG IN" (and "Log in  PASSWORD" on the other
// screen) looked broken, and the link pointed at the page you were already
// standing on. NavBar.jsx hides itself on the same two paths -- keep the two
// lists in step.
function isAuthScreen(pathname) {
  return pathname.startsWith('/login') || pathname.startsWith('/set-password')
}

// Muted, not mint. The bar's session control and the mint page label sat
// adjacent in the same accent colour, which read as one blob. The accent on
// any screen belongs to that screen's own primary action, and that is never
// in this bar.
const actionStyle = {
  fontSize: '0.8rem', fontWeight: type.weight.semibold, color: colors.muted,
  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  whiteSpace: 'nowrap', flexShrink: 0, textDecoration: 'none',
}

export default function TopBar() {
  const { pathname } = useLocation()
  const authScreen = isAuthScreen(pathname)
  const label = pageLabel(pathname)
  // Only a real session names anyone here. This used to fall back to
  // /profile/me -- the acting profile anonymous writes were attributed to
  // before #86 closed the gate -- which was accurate but unreadable: the bar
  // showed a username and a "Log in" link at the same time, so the app looked
  // logged in with no way to log out. Reported by the owner within a day of
  // #105 shipping.
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
          {authScreen ? (
            // With NavBar gone from these screens, this is the only way back
            // into the app for someone who tapped "Log in" and changed their
            // mind -- an installed PWA offers no browser back button. Offered
            // only to a session that has an app to go back to: since #86 there
            // is nothing behind the door without one, and the guard would
            // bounce the tap straight back here.
            profile && (
              <Link to="/" className="tap-target" style={actionStyle}>
                Back to workouts
              </Link>
            )
          ) : (
            <>
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
              {label && <Eyebrow color={colors.mint} size={type.size.sm}>{label}</Eyebrow>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
