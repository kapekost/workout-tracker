import src from '../assets/icons/appmark.png'

// appmark.png is 108x64. Sized by height (`size` = rendered height, width
// follows the aspect) rather than letterboxed into a size x size square: in a
// square it painted only ~60% of `size` tall, which is why the TopBar logo read
// as tiny (owner, 2026-09-28).
const ASPECT = 108 / 64

export default function IconBarbell({ size = 20, opacity = 1, color, style, ...props }) {
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
