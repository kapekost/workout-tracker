import src from '../assets/icons/upperbody.png'

// upperbody.png is 105x80 (wider than tall) -- same letterboxing issue as
// IconArrowTrendingUp (see that file's comment). IconDayLower's source
// (71x81, taller than wide) already renders at full box height under
// object-fit: contain with no correction needed, so in DayIcon.jsx's
// History-list rows an upper-day badge visibly read smaller/weaker than a
// lower-day badge at the identical size prop (2026-09-27 mobile icon
// audit). Scale back up to full height, centered, paint-only.
const ASPECT = 105 / 80

export default function IconDayUpper({ size = 20, opacity = 1, color, style, ...props }) {
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      style={{ opacity, objectFit: 'contain', display: 'inline-block', transform: `scale(${ASPECT})`, ...style }}
      {...props}
    />
  )
}
