export default function IconSparkles({ size = 20, color = 'currentColor', ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true" {...props}>
      <path d="M12 2.7c.5 4.2 1.8 6.1 6 6.6-4.2.5-5.5 2.4-6 6.6-.5-4.2-1.8-6.1-6-6.6 4.2-.5 5.5-2.4 6-6.6Z" />
      <path d="M18.5 13.3c.3 2.3 1 3.2 3.2 3.5-2.2.3-2.9 1.2-3.2 3.5-.3-2.3-1-3.2-3.2-3.5 2.2-.3 2.9-1.2 3.2-3.5Z" />
      <path d="M5.2 3.9c.2 1.4.7 2 2 2.2-1.3.2-1.8.8-2 2.2-.2-1.4-.7-2-2-2.2 1.3-.2 1.8-.8 2-2.2Z" />
    </svg>
  )
}
