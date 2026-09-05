import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
const linkButtonStyle = {
  background: 'none', border: 'none', color: colors.mint, fontSize: type.size.lg,
  fontWeight: type.weight.semibold, cursor: 'pointer', padding: 0,
}

// Shown whether or not the address exists, and whether or not the request even
// reached the server -- the endpoint is deliberately uninformative about which
// addresses have accounts, and an error message here would undo that.
const RESET_SENT = 'If that address has an account, a reset link is on its way. The link expires in an hour.'

export default function Login() {
  const nav = useNavigate()
  const { signIn } = useSession()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
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
      nav('/')
    } catch (err) {
      // The API's messages are generic on purpose ("invalid username or
      // password" covers an unknown user, a wrong password and a never-invited
      // account alike). Show them as written; rewording here would either leak
      // more than the endpoint chose to, or say less than it meant to.
      setError(err.detail || 'Could not reach the server — check your connection and try again.')
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
    <div style={{ paddingTop: space.xxxl, maxWidth: 420 }}>
      <h1 style={{ fontSize: type.size.title, fontWeight: type.weight.bold, marginBottom: space.xs }}>
        Log in
      </h1>
      <p style={{ color: colors.muted2, fontSize: type.size.lg, marginBottom: space.xxl }}>
        Your workouts stay on this device's tracker either way — logging in just
        ties them to your own profile.
      </p>

      <form onSubmit={submit} className="card" style={{ padding: space.xl, marginBottom: space.xxl }}>
        <label style={labelStyle} htmlFor="login-username">Username</label>
        <input id="login-username" type="text" value={username} autoComplete="username"
          autoCapitalize="none" autoCorrect="off"
          onChange={e => setUsername(e.target.value)}
          style={{ ...fieldStyle, marginBottom: space.lg }} />

        <label style={labelStyle} htmlFor="login-password">Password</label>
        <input id="login-password" type="password" value={password} autoComplete="current-password"
          onChange={e => setPassword(e.target.value)}
          style={{ ...fieldStyle, marginBottom: space.xl }} />

        {error && (
          <p role="alert" style={{
            color: colors.text, background: colors.dangerBg, borderRadius: radius.sm,
            padding: '10px 12px', fontSize: type.size.lg, marginBottom: space.xl,
          }}>{error}</p>
        )}

        <button type="submit" className="btn-primary" disabled={busy} style={{ width: '100%' }}>
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
          <label style={labelStyle} htmlFor="reset-email">Email</label>
          <input id="reset-email" type="email" value={email} autoComplete="email"
            autoCapitalize="none" autoCorrect="off"
            onChange={e => setEmail(e.target.value)}
            style={{ ...fieldStyle, marginBottom: space.lg }} />
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
