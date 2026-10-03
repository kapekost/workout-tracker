// Renders the shared `.toast`/`.toast.error` CSS classes (index.css) from the
// { message, type } object useToast() owns. Classes are applied exactly as
// before; the live-region wiring is new.
//
// `role="status"` / `aria-live="polite"` alone is the *unreliable* version of
// this fix. A live region only reliably announces when it already exists in the
// DOM and empty — VoiceOver on iOS in particular will not announce a region
// that is inserted together with its text, which is what `if (!toast) return
// null` produces. So the container is always mounted and empty, and only the
// message inside it changes. Cost is one empty div, permanently.
//
// Errors escalate to role="alert"/assertive, since an error is worth
// interrupting for while a PR announcement is not. Both roles already imply an
// aria-live value, so they are not repeated.
export default function Toast({ toast }) {
  const isError = toast?.type === 'error'
  return (
    <div
      className={toast ? `toast${isError ? ' error' : ''}` : undefined}
      role={toast ? (isError ? 'alert' : 'status') : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      {toast ? toast.message : null}
    </div>
  )
}