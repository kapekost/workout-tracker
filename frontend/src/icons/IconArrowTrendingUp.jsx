export default function IconArrowTrendingUp({ size = 20, color = 'currentColor', ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true" {...props}>
      <path d="M3.2 19.5h17.6v1.7H3.2z" opacity=".22" />
      <rect x="4" y="13.2" width="3.5" height="6.3" rx="1.2" />
      <rect x="9.1" y="10" width="3.5" height="9.5" rx="1.2" />
      <rect x="14.2" y="6.4" width="3.5" height="13.1" rx="1.2" />
      <path d="M4.1 12.2c3.5-.7 6.7-2.4 9.1-4.9l2.2-2.2 1.5 1.5-2.2 2.2c-2.8 2.9-6.3 4.8-10.3 5.6l-.3-2.2Z" />
      <path d="m14.1 4.2 6-.5-.5 6-1.8-1.8-3.7-3.7Z" />
    </svg>
  )
}
