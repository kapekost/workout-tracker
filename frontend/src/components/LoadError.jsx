import { colors, type } from '../lib/theme'

// The one thing this app must never do is answer a question it was not asked.
// Before this existed, four pages each caught a failed read and carried on with
// empty state, which rendered as fact: "No sessions logged yet", "No personal
// bests yet", "Log at least 2 sessions to see a trend" (Wave 1.1, 2026-10-03
// design review). A user mid-workout on gym wifi reads those as the truth about
// their own training.
//
// `.form-error` rather than a new visual language: it is the app's existing
// error surface, the one Wave 0.1 measured to 4.62:1, and it is already built
// for arm's-length reading (1px full border plus a 3px left bar).
//
// `role="alert"` rather than the toast's `role="status"`: this replaces the
// page's content instead of floating over it for 2.5s, so it should interrupt.
// "Nothing was lost" is deliberate — the question behind every one of these
// empty states is "did I lose my history?", and answering it before it is asked
// is worth more than the retry button.
export default function LoadError({ what = 'your data', onRetry }) {
  return (
    <div className="form-error" role="alert" style={{ marginTop: 4 }}>
      <p style={{ fontWeight: type.weight.semibold }}>We couldn't load {what}.</p>
      <p style={{ marginTop: 4 }}>Nothing was lost.</p>
      {onRetry && (
        <button className="btn-secondary" onClick={onRetry}
          style={{ marginTop: 12, fontSize: type.size.md }}>
          Try again
        </button>
      )}
    </div>
  )
}

// Keeps the eyebrow+heading pairing the two full-page error states (Home,
// Workout) share, so a page that replaces its whole content reads the same way
// whether it is a whole page or a card inside one.
export function LoadErrorHeading({ children }) {
  return (
    <>
      <p style={{
        color: colors.danger, fontSize: type.size.base, fontWeight: type.weight.bold,
        letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4,
      }}>
        Couldn't load
      </p>
      <h1 style={{
        fontSize: type.size.title, fontWeight: type.weight.bold,
        letterSpacing: type.letterSpacing.tight, lineHeight: 1.1,
      }}>
        {children}
      </h1>
    </>
  )
}