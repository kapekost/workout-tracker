import src from '../assets/icons/upperbody.png'

export default function IconDayUpper({ size = 20, opacity = 1, color, style, ...props }) {
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
