// Dumb render of the shared `.toast`/`.toast.error` CSS classes (index.css)
// given the { message, type } object useToast() owns. The classes are applied
// exactly as before; only the ARIA attributes below are new.
//
// aria-live="polite" + role="status": every PR announcement and every error in
// the app arrives through this component, and without a live region all of it
// was invisible to a screen reader — the toast is visual-only. polite rather
// than assertive because none of these messages demands an immediate
// interruption; an error here is recoverable and the user is mid-workout.
// Errors get role="alert" so they are announced promptly instead of politely
// queued behind whatever else is speaking.
export default function Toast({ toast }) {
  if (!toast) return null
  const isError = toast.type === 'error'
  return (
    <div
      className={`toast${isError ? ' error' : ''}`}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      {toast.message}
    </div>
  )
}
