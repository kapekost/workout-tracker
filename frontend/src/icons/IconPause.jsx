export default function IconPause({ size = 20, color = 'currentColor', ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true" {...props}>
      <rect x="5.5" y="4" width="5" height="16" rx="2" />
      <rect x="13.5" y="4" width="5" height="16" rx="2" />
      <rect x="7" y="5.5" width="2" height="13" rx="1" opacity=".2" />
      <rect x="15" y="5.5" width="2" height="13" rx="1" opacity=".2" />
    </svg>
  )
}
