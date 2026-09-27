import src from '../assets/icons/history.png'

// history.png is 164x106 -- same letterboxing issue as IconArrowTrendingUp
// (see that file's comment): next to IconHome in NavBar.jsx it reads
// visibly smaller/weaker at the same size prop (2026-09-27 mobile icon
// audit). Scale back up to full height, centered, paint-only.
const ASPECT = 164 / 106

export default function IconClipboardList({ size = 20, opacity = 1, color, style, ...props }) {
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
