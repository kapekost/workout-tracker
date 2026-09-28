import src from '../assets/icons/clock.png'

// clock.png is 80x80 (cropped 2026-09-28 from a 159x104 canvas where the dial
// sat in the left half -- the main reason it read small). Sized by height (`size` = rendered height, width
// follows the aspect) rather than letterboxed into a size x size square, where
// it painted only ~65% of `size` tall (owner found icons too small, 2026-09-28).
const ASPECT = 80 / 80

export default function IconClock({ size = 20, opacity = 1, color, style, ...props }) {
  return (
    <img
      src={src}
      width={Math.round(size * ASPECT)}
      height={size}
      alt=""
      aria-hidden="true"
      style={{ opacity, display: 'inline-block', ...style }}
      {...props}
    />
  )
}
