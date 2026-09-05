import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Eyebrow from './Eyebrow'
import { colors, type } from '../lib/theme'
import { api } from '../api'
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
  const { profile: sessionProfile, signOut } = useSession()
  const [actingProfile, setActingProfile] = useState(null)

  useEffect(() => {
    // The acting profile, for the still-open unauthenticated app: until #86
    // flips the gate, an anonymous visitor's writes really are attributed to
    // the seeded profile, so showing it is accurate rather than a placeholder.
    // Failing silently just means the app name shows alone, same as before #69.
    api.get('/profile/me').then(setActingProfile).catch(() => {})
  }, [])

  // A live session names itself; /profile/me is only the fallback, and #86
  // deletes that endpoint along with the rest of the pre-login shim.
  const profile = sessionProfile || actingProfile

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
          {sessionProfile
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
