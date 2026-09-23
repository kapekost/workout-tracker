export default function IconDayUpper({ size = 20, color = 'currentColor', ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M12 3.5a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5Z" />
      <path d="M8.25 9.5 6 8.25 3.5 10.25 5 12l2-1.25V15l-1 6h3l1-5h3l1 5h3l-1-6v-4.25L18.5 12l1.5-1.75-2.5-2-2.25 1.25" />
      <path d="M8.25 9.5c.9-.75 2.2-1.25 3.75-1.25s2.85.5 3.75 1.25V15h-7.5V9.5Z" />
    </svg>
  )
}
