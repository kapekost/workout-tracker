import src from '../assets/icons/progress.png'

// The owner's preferred Progress nav mark: the colored bar-chart "sticker"
// that #228 replaced with the line-art IconArrowTrendingUp, restored at the
// owner's request (2026-09-28: "i prefer the old progress menu icon, just
// scaled up"). IconArrowTrendingUp stays for the in-page trend indicator.
//
// progress.png is 67x79 (cropped 2026-09-28 from a 164x114 canvas whose bars
// filled only ~40% of it -- the main reason it read small). Sized by height, not letterboxed into a square:
// `size` is the rendered height and the width follows the aspect, so the
// mark reads as tall as the square SVG icons beside it in NavBar.
const ASPECT = 67 / 79

export default function IconProgressChart({ size = 20, opacity = 1, color, style, ...props }) {
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
