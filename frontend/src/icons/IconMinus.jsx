export default function IconMinus({ size = 20, color = 'currentColor', ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true" {...props}>
      <rect x="4" y="9.1" width="16" height="5.8" rx="2.9" />
      <rect x="6.2" y="10.3" width="11.6" height="1.2" rx=".6" opacity=".22" />
    </svg>
  )
}
