export default function IconClock({ size = 20, color = 'currentColor', ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="9.2" />
      <circle cx="12" cy="12" r="6.9" opacity=".2" />
      <path d="M12 6.7v5.7l3.8 2.3" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="1.15" />
    </svg>
  )
}
