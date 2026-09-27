export default function IconExclamationTriangle({ size = 20, color = 'currentColor', ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true" {...props}>
      <path d="m12 3.2 9.1 16.2a1.4 1.4 0 0 1-1.2 2.1H4.1a1.4 1.4 0 0 1-1.2-2.1L12 3.2Z" />
      <path d="m12 6.7 6.9 12.3H5.1L12 6.7Z" opacity=".2" />
      <path d="M12 9v5.2" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1" />
    </svg>
  )
}
