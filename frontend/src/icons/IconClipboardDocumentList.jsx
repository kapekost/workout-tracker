import src from '../assets/icons/clipboard.png'

// clipboard.png is 79x74 (aspect 1.068, close enough to square that
// object-fit: contain's letterboxing is negligible) -- checked live at its
// one call site (Workout.jsx's "Form cues + demo" button, 16px) and it
// reads fine as-is (2026-09-27 mobile icon audit). No correction needed.
export default function IconClipboardDocumentList({ size = 20, opacity = 1, color, style, ...props }) {
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
