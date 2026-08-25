// Dumb render of the shared `.toast`/`.toast.error` CSS classes (index.css)
// given the { message, type } object useToast() owns. Markup is byte-for-
// byte what the 5 call sites this replaces already rendered.
export default function Toast({ toast }) {
  if (!toast) return null
  return (
    <div className={`toast${toast.type === 'error' ? ' error' : ''}`}>{toast.message}</div>
  )
}
