import { forwardRef } from 'react'
import { colors, space } from '../lib/theme'

// The expandable-row + chevron shell duplicated verbatim between Workout.jsx
// and History.jsx (design-system inventory §3.2e): a `card` wrapper, a
// clickable header row ending in the ∧/∨ glyph, and a body rendered only
// while open.
//
// `header` is everything that renders before the chevron — each call site
// keeps full control of its own internal layout (e.g. Workout.jsx's
// exercise name + set-dots), so the header row itself only supplies
// `justify-content: space-between` plus a fixed gap; since each real call
// site's header content already has one flex:1 child that claims all
// leftover width, that gap is the only thing that visibly separates the
// header's trailing content from the chevron — matching both sites' current
// spacing exactly.
//
// `style` (outer wrapper) and `bodyPadding` exist because the two real call
// sites already disagree on marginBottom (12 vs 10) and body padding
// ('16px' vs '14px 16px'), and neither the plan nor the spec resolves that
// gap the way it resolves e.g. EmptyState's padding — so each site passes
// its own current value explicitly rather than one silently snapping to the
// other. `ref` is forwarded because Workout.jsx anchors scrollIntoView() to
// this element on auto-advance.
const DisclosureRow = forwardRef(function DisclosureRow(
  { header, isOpen, onToggle, children, style, bodyPadding = '14px 16px' },
  ref
) {
  return (
    <div ref={ref} className="card" style={{ overflow: 'hidden', ...style }}>
      <div
        onClick={onToggle}
        style={{
          padding: '14px 16px', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', gap: space.md,
        }}
      >
        {header}
        <span style={{ color: colors.muted, fontSize: '1.1rem' }}>{isOpen ? '∧' : '∨'}</span>
      </div>
      {isOpen && (
        <div style={{ borderTop: `1px solid ${colors.border}`, padding: bodyPadding }}>
          {children}
        </div>
      )}
    </div>
  )
})

export default DisclosureRow
