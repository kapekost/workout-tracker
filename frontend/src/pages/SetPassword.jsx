import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { auth } from '../api'
import { useSession } from '../lib/session'
import { colors, type, radius, space } from '../lib/theme'

const labelStyle = {
  display: 'block', color: colors.muted, fontSize: type.size.sm, fontWeight: type.weight.bold,
  letterSpacing: type.labelTracking, textTransform: 'uppercase', marginBottom: 6,
}
const fieldStyle = {
  width: '100%', background: colors.border, color: colors.text, border: 'none',
  borderRadius: radius.sm, padding: '12px 10px', fontSize: '1rem',
}

function Alert({ children }) {
  return (
    <p role="alert" style={{
      color: colors.text, background: colors.dangerBg, borderRadius: radius.sm,
      padding: '10px 12px', fontSize: type.size.lg, marginBottom: space.xl,
    }}>{children}</p>
  )
}

export default function SetPassword() {
  const nav = useNavigate()
  const { signIn } = useSession()
  const [params] = useSearchParams()
  const token = params.get('token')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
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

  return (
    <div style={{ paddingTop: space.xxxl, maxWidth: 420 }}>
      <h1 style={{ fontSize: type.size.title, fontWeight: type.weight.bold, marginBottom: space.xs }}>
        Set your password
      </h1>
      <p style={{ color: colors.muted2, fontSize: type.size.lg, marginBottom: space.xxl }}>
        Pick something at least 12 characters long. You'll be logged in straight
        after.
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
          <label style={labelStyle} htmlFor="new-password">New password</label>
          <input id="new-password" type="password" value={password} autoComplete="new-password"
            onChange={e => setPassword(e.target.value)}
            style={{ ...fieldStyle, marginBottom: space.lg }} />

          <label style={labelStyle} htmlFor="confirm-password">Confirm password</label>
          <input id="confirm-password" type="password" value={confirm} autoComplete="new-password"
            onChange={e => setConfirm(e.target.value)}
            style={{ ...fieldStyle, marginBottom: space.xl }} />

          {error && <Alert>{error}</Alert>}

          <button type="submit" className="btn-primary" disabled={busy} style={{ width: '100%' }}>
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
