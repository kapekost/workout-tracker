export default function IconChevronDown({ size = 20, color = 'currentColor', ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true" {...props}>
      <path d="m4.3 8.6 2.1-2.1L12 12.1l5.6-5.6 2.1 2.1L12 16.3 4.3 8.6Z" />
    </svg>
  )
}
