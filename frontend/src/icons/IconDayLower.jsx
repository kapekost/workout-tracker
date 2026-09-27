import src from '../assets/icons/lowerbody.png'

export default function IconDayLower({ size = 20, opacity = 1, color, style, ...props }) {
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
