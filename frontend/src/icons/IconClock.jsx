import src from '../assets/icons/clock.png'

// clock.png is 159x104 (aspect 1.529, wide like IconArrowTrendingUp/
// IconClipboardList) so it's letterboxed under object-fit: contain the same
// way, but its real call sites (TimerBar's session clock, History's session
// duration) sit small and un-flexed next to monospace/small text with no
// same-size full-height comparator beside them -- checked live at 12-16px
// (2026-09-27 mobile icon audit) and it read fine as-is. Deliberately left
// uncorrected; not a miss.
export default function IconClock({ size = 20, opacity = 1, color, style, ...props }) {
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
