import { radius } from '../lib/theme'

// Wave 0.7 (2026-10-03 design review): this was the one component the design
// system never reached — it imported nothing from theme.js and hardcoded the
// same radius.sm value the other eight components take from the token.
//
// `height` has no default on purpose. It had `= 16`, which was dead: all ten call
// sites pass their own. A default nobody exercises is a second, invisible
// contract, and this one is a size — a caller that forgot it would silently get
// a 16px block instead of an obvious zero-height one.
export default function Skeleton({ height, width = '100%', style }) {
  return <div className="skeleton" style={{ height, width, borderRadius: radius.sm, ...style }} />
}
