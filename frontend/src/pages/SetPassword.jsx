import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { auth } from '../api'
import { useSession } from '../lib/session'
import { colors, type, space } from '../lib/theme'

function Alert({ children }) {
  return (
    <p className="form-error" role="alert" aria-live="assertive"
      style={{ marginBottom: space.xl }}>{children}</p>
  )
}

export default function SetPassword() {
  const nav = useNavigate()
  const { signIn } = useSession()
  const [params] = useSearchParams()
  const token = params.get('token')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    if (password !== confirm) {
      // Checked here rather than server-side because the token is single-use:
      // a typo'd confirmation must not burn the link the email carried.
      setError('The two passwords do not match.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const profile = await auth.setPassword(token, password)
      signIn(profile)
      nav('/')
    } catch (err) {
      // Unknown, expired and already-used tokens all answer the same thing on
      // purpose, and so does a password that breaks the length rule. Both are
      // shown as written.
      setError(err.detail || 'Could not reach the server — check your connection and try again.')
      setBusy(false)
    }
  }

  // One toggle for both fields: they have to match, so revealing one without
  // the other tells you nothing about the typo you are hunting for. A second
  // button on the confirm field would only repeat this one's accessible name.
  const fieldType = showPassword ? 'text' : 'password'

  return (
    <div className="auth-shell">
      <h1 style={{ fontSize: type.size.title, fontWeight: type.weight.bold, marginBottom: space.xs }}>
        Set your password
      </h1>
      <p style={{ color: colors.muted2, fontSize: type.size.lg, marginBottom: space.xxl }}>
        Choose a password for your account. You'll be logged in straight after.
      </p>

      {!token ? (
        <div className="card" style={{ padding: space.xl }}>
          <Alert>This link is missing its token, so it can't be used. Ask for a fresh one from the login screen.</Alert>
          <Link to="/login" style={{ color: colors.mint, fontWeight: type.weight.semibold }}>
            Go to log in
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="card" style={{ padding: space.xl }}>
          <label className="field-label" htmlFor="new-password">New password</label>
          {/* The rule the API enforces, stated next to the field it applies
              to instead of buried in the intro paragraph. */}
          {/* muted, not muted2: this is the one rule the user has to comply
              with, and muted2 measures 3.86:1 on --card -- the dimmest text on
              the first screen a new account ever sees. */}
          <p id="password-rule" style={{ color: colors.muted, fontSize: type.size.lg, marginBottom: 6 }}>
            At least 12 characters.
          </p>
          <div className="field-row" style={{ marginBottom: space.lg }}>
            {/* The iOS text-entry hints matter because the toggle flips both
                fields to type="text": a shown password would otherwise be
                autocapitalised and autocorrected as you type it. */}
            <input id="new-password" className="field" type={fieldType} value={password}
              autoComplete="new-password" aria-describedby="password-rule"
              autoCapitalize="none" autoCorrect="off" spellCheck="false"
              onChange={e => setPassword(e.target.value)} />
            <button type="button" className="field-toggle" aria-pressed={showPassword}
              aria-label={showPassword ? 'Hide passwords' : 'Show passwords'}
              onClick={() => setShowPassword(v => !v)}>
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>

          <label className="field-label" htmlFor="confirm-password">Confirm password</label>
          <input id="confirm-password" className="field" type={fieldType} value={confirm}
            autoComplete="new-password"
            autoCapitalize="none" autoCorrect="off" spellCheck="false"
            onChange={e => setConfirm(e.target.value)}
            style={{ marginBottom: space.xl }} />

          {error && <Alert>{error}</Alert>}

          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Set password'}
          </button>

          {error && (
            <p style={{ marginTop: space.lg, fontSize: type.size.lg }}>
              <Link to="/login" style={{ color: colors.mint, fontWeight: type.weight.semibold }}>
                Go to log in
              </Link>
              {' — you can send yourself a fresh link from there.'}
            </p>
          )}
        </form>
      )}
    </div>
  )
}
