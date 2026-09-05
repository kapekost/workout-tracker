import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import SetPassword from './SetPassword'
import { SessionContext } from '../lib/session'

vi.mock('../api', () => ({
  auth: { setPassword: vi.fn() },
}))
import { auth } from '../api'

function apiError(status, detail) {
  const err = new Error(`API POST /auth/set-password → ${status}`)
  err.status = status
  err.detail = detail
  return err
}

function renderSetPassword(search = '?token=raw-token', { signIn = vi.fn() } = {}) {
  const session = { profile: null, ready: true, signIn, signOut: vi.fn() }
  render(
    <SessionContext.Provider value={session}>
      <MemoryRouter initialEntries={[`/set-password${search}`]}>
        <Routes>
          <Route path="/set-password" element={<SetPassword />} />
          <Route path="/" element={<h1>Home screen</h1>} />
          <Route path="/login" element={<h1>Log in screen</h1>} />
        </Routes>
      </MemoryRouter>
    </SessionContext.Provider>
  )
  return { signIn }
}

function fillPassword(password, confirm = password) {
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: password } })
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: confirm } })
}

beforeEach(() => { vi.clearAllMocks() })

describe('SetPassword', () => {
  it('posts the token from the URL with the new password and lands Home with a session', async () => {
    const profile = { id: 2, username: 'invited', role: 'member', icon: null }
    auth.setPassword.mockResolvedValue(profile)
    const { signIn } = renderSetPassword('?token=raw-token')

    fillPassword('a long enough password')
    fireEvent.click(screen.getByRole('button', { name: 'Set password' }))

    await screen.findByText('Home screen')
    expect(auth.setPassword).toHaveBeenCalledWith('raw-token', 'a long enough password')
    expect(signIn).toHaveBeenCalledWith(profile)
  })

  it('shows the API\'s generic message for an expired, used or unknown token', async () => {
    auth.setPassword.mockRejectedValue(apiError(400, 'this link is invalid or has expired'))
    renderSetPassword('?token=stale-token')

    fillPassword('a long enough password')
    fireEvent.click(screen.getByRole('button', { name: 'Set password' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('this link is invalid or has expired')
    // The error state, not a blank screen: the form and a way onward stay put.
    expect(screen.getByRole('link', { name: /log in/i })).toBeInTheDocument()
    expect(screen.queryByText('Home screen')).not.toBeInTheDocument()
  })

  it('says the link is unusable when the URL carries no token at all', async () => {
    renderSetPassword('')

    expect(await screen.findByRole('alert')).toHaveTextContent(/link/i)
    // Nothing to post, so nothing is posted.
    expect(auth.setPassword).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
  })

  it('shows the API\'s length rule when the password is too short', async () => {
    auth.setPassword.mockRejectedValue(apiError(400, 'password must be at least 12 characters'))
    renderSetPassword()

    fillPassword('short')
    fireEvent.click(screen.getByRole('button', { name: 'Set password' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('password must be at least 12 characters')
  })

  it('catches a mismatched confirmation before spending the single-use token', async () => {
    renderSetPassword()

    fillPassword('a long enough password', 'a different password')
    fireEvent.click(screen.getByRole('button', { name: 'Set password' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i)
    expect(auth.setPassword).not.toHaveBeenCalled()
  })

  it('falls back to its own wording when the failure carries no message', async () => {
    auth.setPassword.mockRejectedValue(new TypeError('Failed to fetch'))
    renderSetPassword()

    fillPassword('a long enough password')
    fireEvent.click(screen.getByRole('button', { name: 'Set password' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach/i)
  })

  it('does not submit twice while the request is in flight', async () => {
    let resolve
    auth.setPassword.mockReturnValue(new Promise(r => { resolve = r }))
    renderSetPassword()

    fillPassword('a long enough password')
    const button = screen.getByRole('button', { name: 'Set password' })
    fireEvent.click(button)
    await waitFor(() => expect(button).toBeDisabled())
    fireEvent.click(button)
    expect(auth.setPassword).toHaveBeenCalledTimes(1)

    resolve({ id: 2, username: 'invited' })
    await screen.findByText('Home screen')
  })
})
