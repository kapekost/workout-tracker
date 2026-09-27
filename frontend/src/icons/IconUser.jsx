export default function IconUser({ size = 20, color = 'currentColor', ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true" {...props}>
      <circle cx="12" cy="7.3" r="4" />
      <path d="M4.2 20.5c.7-4.6 3.5-7 7.8-7s7.1 2.4 7.8 7H4.2Z" />
      <path d="M7.1 18.5c1.1-2.2 2.7-3.2 4.9-3.2s3.8 1 4.9 3.2H7.1Z" opacity=".25" />
    </svg>
  )
}
