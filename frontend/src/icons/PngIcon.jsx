// Shared PNG contract (#229 spec section 2): every PNG source is exported
// onto a square canvas with its content at ~84% fill, centred, so `size`
// means the same size x size box as an SVG icon's viewBox. The one exception
// is IconBarbell, which is sized by height directly (see that file) rather
// than through this component.
export default function PngIcon({ src, size, opacity = 1, style, ...props }) {
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
