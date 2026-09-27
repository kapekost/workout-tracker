import src from '../assets/icons/clock.png'

export default function IconClock({ size = 20, opacity = 1, color, style, ...props }) {
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      style={{ opacity, objectFit: 'contain', display: 'block', ...style }}
      {...props}
    />
  )
}
