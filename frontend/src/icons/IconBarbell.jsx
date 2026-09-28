import src from '../assets/icons/appmark.png'

// appmark.png is 108x64 (aspect 1.688, the widest of the 7 PNG icons) so
// it's letterboxed under object-fit: contain more than any icon that did
// get corrected, but its one call site (TopBar's "Gym Tracker" logo, 16px)
// has no adjacent same-size full-height comparator, and a flat, wide
// double-dumbbell silhouette is the idiomatically correct shape for a
// barbell mark, not a distortion of it -- checked live (2026-09-27 mobile
// icon audit) and it read fine as-is. Deliberately left uncorrected.
export default function IconBarbell({ size = 20, opacity = 1, color, style, ...props }) {
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      style={{ opacity, objectFit: 'contain', display: 'inline-block', ...style }}
      {...props}
    />
  )
}
