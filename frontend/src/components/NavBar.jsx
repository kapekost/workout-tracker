import { useLocation, useNavigate } from 'react-router-dom'
import Eyebrow from './Eyebrow'
import { colors, type, icon } from '../lib/theme'
import { IconNavHome, IconNavProgress, IconNavHistory } from '../icons'

const tabs = [
  { path: '/', label: 'Home', Icon: IconNavHome },
  { path: '/progress', label: 'Progress', Icon: IconNavProgress },
  { path: '/history', label: 'History', Icon: IconNavHistory },
]

export default function NavBar() {
  const { pathname } = useLocation()
  const nav = useNavigate()
  // /personal-bests is a drill-down reachable only from the Progress tab
  // (its own in-page breadcrumb reads "Progress") -- it doesn't start with
  // any tab's own path, so the generic prefix-match below used to fall
  // through to the '/' default and light up Home instead. Special-case it
  // onto '/progress' before the generic match runs.
  const active = pathname === '/' ? '/'
    : pathname.startsWith('/personal-bests') ? '/progress'
    : tabs.find(t => pathname.startsWith(t.path) && t.path !== '/')?.path ?? '/'

  // The auth screens are deliberately chrome-free. Keeping the app's primary
  // nav on a screen with exactly one action pulled the eye to the bottom of an
  // otherwise empty page and made the door look like a broken app page.
  // TopBar.jsx drops its label and action on the same two paths -- keep the
  // two lists in step. This is presentation only: the gate that decides who
  // reaches which screen is App.jsx's route tables, not this.
  if (pathname.startsWith('/login') || pathname.startsWith('/set-password')) return null

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
      zIndex: 50
    }}>
      {/* TopBar already solves the same problem by wrapping its contents in
          .page-shell (index.css) -- without this, the tabs spread across the
          full viewport at justify-content: space-around, sitting ~350px apart
          under a 448px content column on a wide screen (2026-09-06 UI review,
          item 14). */}
      <div className="page-shell" style={{ display: 'flex', width: '100%', justifyContent: 'space-around', paddingBottom: 0 }}>
        {tabs.map(tab => {
          const isActive = active === tab.path
          return (
            <button
              key={tab.path}
              onClick={() => nav(tab.path)}
              // aria-current tells a screen reader which tab you are on. The
              // active state was carried entirely by icon+label color, so
              // without this the three tabs announced as three identical links
              // with no indication of position.
              aria-current={isActive ? 'page' : undefined}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 3, background: 'none', border: 'none',
                cursor: 'pointer', padding: '4px 0', minHeight: 48
              }}
            >
              {/* #229: two-tone SVGs, active drives both tones via `active`,
                  never opacity (the failure mode on record at #211/#213/#228). */}
              <tab.Icon size={icon.nav} active={isActive} />
              <Eyebrow color={isActive ? colors.accent : colors.muted} style={{ fontWeight: type.weight.semibold }}>
                {tab.label}
              </Eyebrow>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
