export default function IconDayUpper({ size = 20, color = 'currentColor', ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true" {...props}>
      <circle cx="12" cy="5.3" r="3" />
      <path d="M8.7 8.2c-1.4.5-2.5 1.2-3.5 2.3L3.4 13l2.1 1.8 2-1.7-.8 6.9c-.1 1 .7 1.8 1.7 1.8h7.2c1 0 1.8-.8 1.7-1.8l-.8-6.9 2 1.7 2.1-1.8-1.8-2.5c-1-1.1-2.1-1.8-3.5-2.3L12 11.1 8.7 8.2Z" />
      <path d="m8.8 10.1 3.2 2.8 3.2-2.8-.7-1.1-2.5 2.1-2.5-2.1-.7 1.1Z" opacity=".24" />
      <path d="M9.2 14.1h5.6v5.9H9.2z" opacity=".16" />
    </svg>
  )
}
