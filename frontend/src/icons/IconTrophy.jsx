export default function IconTrophy({ size = 20, color = 'currentColor', ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true" {...props}>
      <path d="M7 3.2h10v6.1c0 3.1-1.7 5.6-5 6.5-3.3-.9-5-3.4-5-6.5V3.2Z" />
      <path d="M7 5H4.3v2.1c0 3.2 1.8 5.1 4.7 5.5v-1.9c-1.7-.4-2.7-1.5-2.8-3.6H7V5Zm10 0h2.7v2.1c0 3.2-1.8 5.1-4.7 5.5v-1.9c1.7-.4 2.7-1.5 2.8-3.6H17V5Z" />
      <path d="M10.1 14.4h3.8v4.1h2.4v2.3H7.7v-2.3h2.4v-4.1Z" />
      <path d="M10 5h4v2.1h-4z" opacity=".25" />
    </svg>
  )
}
