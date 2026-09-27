export default function IconXMark({ size = 20, color = 'currentColor', ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeLinecap="round" aria-hidden="true" {...props}>
      <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" strokeWidth="4" />
      <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" strokeWidth="1.4" opacity=".35" />
    </svg>
  )
}
