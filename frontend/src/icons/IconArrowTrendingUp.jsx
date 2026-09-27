import src from '../assets/icons/progress.png'

// progress.png is 164x114 (wider than tall). At size x size with
// object-fit: contain, the box's own height is what's left over after the
// wide image fills the width -- that shorts the rendered glyph to ~70% of
// `size` tall, next to IconHome (an SVG that fills its full square) in
// NavBar.jsx it visibly reads smaller/weaker at the identical size prop
// (2026-09-27 mobile icon audit). `transform: scale(ASPECT)` enlarges the
// already-contained, correctly-proportioned image back up to full height,
// centered on the img's own box -- it overflows the nominal size x size
// footprint symmetrically left/right (a paint-only effect; transforms don't
// participate in layout), so every call site's spacing is unaffected.
const ASPECT = 164 / 114

export default function IconArrowTrendingUp({ size = 20, opacity = 1, color, style, ...props }) {
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
