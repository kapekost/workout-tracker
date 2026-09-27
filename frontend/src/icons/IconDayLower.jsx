export default function IconDayLower({ size = 20, color = 'currentColor', ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true" {...props}>
      <path d="M7.5 3.2h9l1.1 5.1-2.2 3.2.9 8.9c.1 1-.6 1.7-1.5 1.7h-1.1l-1.7-7.7-1.7 7.7H9.2c-.9 0-1.6-.7-1.5-1.7l.9-8.9-2.2-3.2 1.1-5.1Z" />
      <path d="M7.4 8.2 12 11.5l4.6-3.3-.7-3.1H8.1l-.7 3.1Z" opacity=".2" />
      <path d="M8.8 12.1 12 14.4l3.2-2.3-.4 2.1-2.8 2.1-2.8-2.1-.4-2.1Z" opacity=".2" />
    </svg>
  )
}
