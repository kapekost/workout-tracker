export default function IconPencil({ size = 20, color = 'currentColor', ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true" {...props}>
      <path d="m14.8 4.1 5.1 5.1-10.9 10.9-5.8.7.7-5.8L14.8 4.1Z" />
      <path d="m13.2 5.7 5.1 5.1" fill="none" stroke={color} strokeWidth="1.5" opacity=".3" />
      <path d="m3.9 20.1 1.3-4.5 3.2 3.2-4.5 1.3Z" opacity=".45" />
    </svg>
  )
}
