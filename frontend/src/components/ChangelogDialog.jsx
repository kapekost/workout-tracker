import { useEffect, useRef } from 'react'
import { colors, type, icon } from '../lib/theme'
import { IconXMark } from '../icons'

export const MAX_ENTRIES = 10

export default function ChangelogDialog({ entries, onClose }) {
  const closeRef = useRef(null)
  const shown = [...entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_ENTRIES)

  useEffect(() => {
    closeRef.current?.focus()
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  return (
    <div role="dialog" aria-modal="true" aria-label="What's new" onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}>
      <div onClick={e => e.stopPropagation()}
        style={{
          background: colors.bg, borderRadius: 16, width: '100%', maxWidth: 'var(--content-max-width)',
          maxHeight: '80vh', overflowY: 'auto', padding: 16,
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ fontSize: '1.3rem', fontWeight: type.weight.bold }}>What's new</h2>
          <button ref={closeRef} className="btn-icon tap-target" aria-label="Close" onClick={onClose}>
            <IconXMark size={icon.control} />
          </button>
        </div>
        {shown.length === 0 ? (
          <p style={{ color: colors.muted2, fontSize: type.size.md }}>Nothing to show yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
            {shown.map(e => (
              <li key={`${e.date}-${e.text}`}>
                <div className="font-mono" style={{ color: colors.muted2, fontSize: type.size.xs }}>{e.date}</div>
                <div style={{ fontSize: type.size.md }}>{e.text}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
