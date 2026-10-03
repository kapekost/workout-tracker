export default function IconCheck({ size = 20, color = 'currentColor', ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M5.1 12.4 9.5 17l9.4-10" strokeWidth="4.2" />
      <path d="M5.1 12.4 9.5 17l9.4-10" strokeWidth="1.5" opacity=".35" />
    </svg>
  )
}
