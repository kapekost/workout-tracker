import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { auth } from '../api'
import { useSession } from '../lib/session'
import { colors, type, space } from '../lib/theme'

const linkButtonStyle = {
  background: 'none', border: 'none', color: colors.mint, fontSize: type.size.lg,
  fontWeight: type.weight.semibold, cursor: 'pointer', padding: 0,
}

// The API's messages are lowercase and unpunctuated, which reads as a log line
// on the app's front door. Casing carries no information about which accounts
// exist, so this is presentation only -- the string itself stays verbatim.
const sentenceCase = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)

// Where the guard sent you, named in the reader's words. `from` is a route, and
// a path is not something to show someone mid-workout.
const DESTINATIONS = {
  '/history': 'your history',
  '/progress': 'your progress',
  '/personal-bests': 'your personal bests',
}
const destinationOf = (path) =>
  DESTINATIONS[path] || (path.startsWith('/workout') || path.startsWith('/exercise')
    ? 'your workout' : null)

// Shown whether or not the address exists, and whether or not the request even
// reached the server -- the endpoint is deliberately uninformative about which
// addresses have accounts, and an error message here would undo that.
const RESET_SENT = 'If that address has an account, a reset link is on its way. The link expires in an hour.'

export default function Login() {
  const nav = useNavigate()
  // Where the guard interrupted you, if it did. Set by App's RedirectToLogin;
  // absent when you walked in here yourself, and Home is the honest answer
  // then. `replace` so the back button leaves the app rather than returning
  // to a door you are already through.
  const from = useLocation().state?.from || '/'
  const { signIn } = useSession()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const profile = await auth.login(username, password)
      signIn(profile)
      nav(from, { replace: true })
    } catch (err) {
      // The API's messages are generic on purpose ("invalid username or
      // password" covers an unknown user, a wrong password and a never-invited
      // account alike). Show them as written; rewording here would either leak
      // more than the endpoint chose to, or say less than it meant to.
      setError(sentenceCase(err.detail) || 'Could not reach the server — check your connection and try again.')
      setBusy(false)
    }
  }

  async function sendReset(e) {
    e.preventDefault()
    if (sending) return
    setSending(true)
    try { await auth.forgotPassword(email) } catch { /* same answer either way */ }
    setSent(true)
    setSending(false)
  }

  return (
    <div className="auth-shell">
      <h1 style={{ fontSize: type.size.title, fontWeight: type.weight.bold, marginBottom: space.xs }}>
        Log in
      </h1>
      {/* Said in the reader's terms, not the app's -- and it has to be true.
          Before #86 logging in was optional and this line said so; it is not
          optional now, so promising that workouts are "saved either way" would
          be the first thing the app got wrong on the first screen it shows. */}
      <p style={{ color: colors.muted2, fontSize: type.size.lg, marginBottom: space.xxl }}>
        Your workouts, history and personal bests are all in here. Log in to
        pick up where you left off.
      </p>
      {/* Being bounced here by the guard and logging out yourself render the
          same screen otherwise. Destination only, deliberately: `from` is set
          in both cases and telling a bounce from an expired session apart
          needs state this screen does not carry, so any "your session expired"
          wording would be a guess. Where you were headed is true either way. */}
      {destinationOf(from) && (
        <p style={{ color: colors.muted, fontSize: type.size.lg, marginTop: `-${space.lg}px`, marginBottom: space.xxl }}>
          Then we'll take you back to {destinationOf(from)}.
        </p>
      )}

      <form onSubmit={submit} className="card" style={{ padding: space.xl, marginBottom: space.xxl }}>
        <label className="field-label" htmlFor="login-username">Username</label>
        <input id="login-username" className="field" type="text" value={username}
          autoComplete="username" autoCapitalize="none" autoCorrect="off"
          onChange={e => setUsername(e.target.value)}
          style={{ marginBottom: space.lg }} />

        <label className="field-label" htmlFor="login-password">Password</label>
        <div className="field-row" style={{ marginBottom: space.xl }}>
          {/* type flips to "text" when revealed, which is also why the iOS
              text-entry hints are set here: without them the keyboard would
              autocapitalise and autocorrect a shown password. */}
          <input id="login-password" className="field" type={showPassword ? 'text' : 'password'}
            value={password} autoComplete="current-password"
            autoCapitalize="none" autoCorrect="off" spellCheck="false"
            onChange={e => setPassword(e.target.value)} />
          <button type="button" className="field-toggle" aria-pressed={showPassword}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            onClick={() => setShowPassword(v => !v)}>
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>

        {error && (
          <p className="form-error" role="alert" aria-live="assertive"
            style={{ marginBottom: space.xl }}>{error}</p>
        )}

        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>

      {!forgot && (
        <button type="button" onClick={() => setForgot(true)} className="tap-target" style={linkButtonStyle}>
          Forgot your password?
        </button>
      )}

      {forgot && (
        <form onSubmit={sendReset} className="card" style={{ padding: space.xl }}>
          <label className="field-label" htmlFor="reset-email">Email</label>
          <input id="reset-email" className="field" type="email" value={email}
            autoComplete="email" autoCapitalize="none" autoCorrect="off"
            onChange={e => setEmail(e.target.value)}
            style={{ marginBottom: space.lg }} />
          {sent
            ? <p style={{ color: colors.mint, fontSize: type.size.lg }}>{RESET_SENT}</p>
            : (
              <button type="submit" className="btn-secondary" disabled={sending} style={{ width: '100%' }}>
                {sending ? 'Sending…' : 'Send reset link'}
              </button>
            )}
        </form>
      )}
    </div>
  )
}
