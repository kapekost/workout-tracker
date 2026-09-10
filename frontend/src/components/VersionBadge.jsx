import { useState, useSyncExternalStore } from 'react'
import { useLocation } from 'react-router-dom'
import { colors, type } from '../lib/theme'
import { updateStore, shouldCheckForUpdate } from '../lib/swUpdate'

// A brief, purely cosmetic tap-feedback flash. checkNow() (swUpdate.js)
// doesn't hand back anything to await -- it fires registration.update() and
// forgets it, same as this component forgets the timer once it's set. The
// real "did anything change" signal is the ready prompt appearing a moment
// later via the store, not this label; mirrors the no-cleanup-needed shape
// of Home.jsx's `starting` flag.
const CHECKING_FLASH_MS = 1500

// Rest state: `v <commit>` plus an icon-only check button (Decision 2 in the
// #125 plan). Ready state: the whole row swaps to a single tappable label
// instead of adding a second element, so the header's resting footprint
// never grows. shouldCheckForUpdate is the same pathname gate main.jsx uses
// to decide whether to even run a check -- reused here as the DISPLAY gate,
// so the two can never disagree about whether now is a safe moment.
export default function VersionBadge({ store = updateStore }) {
  const ready = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const { pathname } = useLocation()
  const [checking, setChecking] = useState(false)

  function handleCheck() {
    setChecking(true)
    store.checkNow()
    setTimeout(() => setChecking(false), CHECKING_FLASH_MS)
  }

  if (ready && shouldCheckForUpdate(pathname)) {
    return (
      // Not `.tap-target`: same centered-44px-hit-zone overlap the check
      // button had (see below) — confirmed by the same kind of real hit-test,
      // clicking the title applied the update. Same top-anchored fix.
      <button type="button" onClick={store.applyUpdate} style={{
        position: 'relative', fontSize: type.size.sm, fontWeight: type.weight.semibold, color: colors.mint,
        background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left',
      }}>
        New version — tap to reload
        <span aria-hidden="true" style={{
          position: 'absolute', left: '50%', top: 0, transform: 'translateX(-50%)',
          width: 'max(100%, 44px)', height: 44,
        }} />
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span className="font-mono" style={{ color: colors.muted2, fontSize: type.size.xs }}>
        v {__APP_COMMIT__}
      </span>
      {/* Not `.tap-target`: that class centers its invisible 44px hit-zone on the
          button, which bleeds upward into the title text directly above this row
          (confirmed by a real hit-test: clicking the title triggered this button).
          Anchoring the zone's top edge to the button's own top instead keeps the
          full 44px target but only extends it downward/sideways, into empty space. */}
      <button type="button" onClick={handleCheck} aria-label="Check for update"
        style={{
          position: 'relative', background: 'none', border: 'none', color: colors.muted2,
          cursor: 'pointer', fontSize: type.size.xs, padding: 0, lineHeight: 1,
        }}>
        {checking ? 'Checking…' : '⟳'}
        <span aria-hidden="true" style={{
          position: 'absolute', left: '50%', top: 0, transform: 'translateX(-50%)',
          width: 'max(100%, 44px)', height: 44,
        }} />
      </button>
    </div>
  )
}
