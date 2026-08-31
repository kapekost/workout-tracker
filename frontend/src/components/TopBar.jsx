import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Eyebrow from './Eyebrow'
import { colors, type } from '../lib/theme'
import { api } from '../api'

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
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    // No login yet (#67) — there's exactly one profile in practice. Failing
    // silently here just means the app name shows alone, same as before #69.
    api.get('/profile/me').then(setProfile).catch(() => {})
  }, [])

  return (
    <div style={{
      background: colors.bg, borderBottom: `1px solid ${colors.border}`
    }}>
      <div className="page-shell" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px'
      }}>
        <span style={{ fontWeight: type.weight.bold, fontSize: '0.9rem', color: colors.text, letterSpacing: type.labelTracking }}>
          🏋 Gym Tracker
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {profile && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', color: colors.text }}>
              <span aria-hidden="true">{profile.icon || '👤'}</span>
              <span>{profile.username}</span>
            </span>
          )}
          <Eyebrow color={colors.mint} size={type.size.sm}>{label}</Eyebrow>
        </div>
      </div>
    </div>
  )
}
