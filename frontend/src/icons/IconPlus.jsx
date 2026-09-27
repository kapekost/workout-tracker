export default function IconPlus({ size = 20, color = 'currentColor', ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true" {...props}>
      <rect x="9.1" y="4" width="5.8" height="16" rx="2.9" />
      <rect x="4" y="9.1" width="16" height="5.8" rx="2.9" />
      <path d="M10.4 6.4h3.2v11.2h-3.2z" opacity=".2" />
    </svg>
  )
}
