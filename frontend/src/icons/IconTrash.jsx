export default function IconTrash({ size = 20, color = 'currentColor', ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true" {...props}>
      <path d="M5.2 6.5h13.6l-.8 13a1.8 1.8 0 0 1-1.8 1.7H7.8A1.8 1.8 0 0 1 6 19.5l-.8-13Z" />
      <rect x="4" y="4.2" width="16" height="2.6" rx="1.3" />
      <path d="M9 4.2V2.8h6v1.4" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M9.1 9.2v7.5M12 9.2v7.5M14.9 9.2v7.5" stroke={color} strokeWidth="1.25" opacity=".3" />
    </svg>
  )
}
