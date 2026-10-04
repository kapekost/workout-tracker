import src from '../assets/icons/appmark.png'

// The one non-square icon (#229 spec section 2): a wide wordmark-style
// glyph, so it's sized by height rather than through PngIcon's size x size
// contract — width follows the source's own aspect ratio.
export default function IconBarbell({ size = 20, opacity = 1, color, style, ...props }) {
  return (
    <img
      src={src}
      height={size}
      alt=""
      aria-hidden="true"
      style={{ opacity, objectFit: 'contain', display: 'inline-block', ...style }}
      {...props}
    />
  )
}
