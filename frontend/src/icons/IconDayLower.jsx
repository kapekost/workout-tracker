export default function IconDayLower({ size = 20, color = 'currentColor', ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M12 2.5a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5Z" />
      <path d="M8.5 8h7l.5 5.5-1.5 2v4.5a1.5 1.5 0 0 1-3 0v-3.5h-1v3.5a1.5 1.5 0 0 1-3 0V15.5l-1.5-2L8.5 8Z" />
      <path d="M9.75 13.5h4.5" />
    </svg>
  )
}
