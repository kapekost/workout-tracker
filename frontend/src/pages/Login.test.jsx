import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Login from './Login'
import { SessionContext } from '../lib/session'

vi.mock('../api', () => ({
  auth: { login: vi.fn(), forgotPassword: vi.fn() },
}))
import { auth } from '../api'

function apiError(status, detail) {
  const err = new Error(`API POST /auth/login → ${status}`)
  err.status = status
  err.detail = detail
  return err
}

function renderLogin({ signIn = vi.fn() } = {}) {
  const session = { profile: null, ready: true, signIn, signOut: vi.fn() }
  render(
    <SessionContext.Provider value={session}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<h1>Home screen</h1>} />
        </Routes>
      </MemoryRouter>
    </SessionContext.Provider>
  )
  return { signIn }
}

function fillCredentials(username = 'kapekost', password = 'correct horse battery') {
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: username } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } })
}

beforeEach(() => { vi.clearAllMocks() })

describe('Login', () => {
  it('submits the credentials and lands on Home with a session', async () => {
    const profile = { id: 1, username: 'kapekost', role: 'admin', icon: '💪' }
    auth.login.mockResolvedValue(profile)
    const { signIn } = renderLogin()

    fillCredentials()
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))

    await screen.findByText('Home screen')
    expect(auth.login).toHaveBeenCalledWith('kapekost', 'correct horse battery')
    expect(signIn).toHaveBeenCalledWith(profile)
  })

  // Capitalised, not reworded. The endpoint is deliberately generic -- the same
  // message covers an unknown user, a wrong password and a never-invited
  // account -- and that genericness is the security property. Case is not part
  // of it, so the screen sentence-cases for presentation and nothing else.
  it('shows the API\'s generic message when the password is wrong', async () => {
    auth.login.mockRejectedValue(apiError(401, 'invalid username or password'))
    renderLogin()

    fillCredentials('kapekost', 'wrong')
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid username or password')
    expect(screen.queryByText('Home screen')).not.toBeInTheDocument()
  })

  it('shows the rate-limit message with its wording untouched too', async () => {
    auth.login.mockRejectedValue(apiError(429, 'too many attempts; try again in a few minutes'))
    renderLogin()

    fillCredentials()
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('Too many attempts; try again in a few minutes')
  })

  it('falls back to its own wording when the failure carries no message', async () => {
    auth.login.mockRejectedValue(new TypeError('Failed to fetch'))
    renderLogin()

    fillCredentials()
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach/i)
  })

  it('clears a previous error when the next attempt is submitted', async () => {
    auth.login.mockRejectedValueOnce(apiError(401, 'invalid username or password'))
    auth.login.mockResolvedValueOnce({ id: 1, username: 'kapekost' })
    renderLogin()

    fillCredentials('kapekost', 'wrong')
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
    await screen.findByRole('alert')

    fillCredentials()
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
    await screen.findByText('Home screen')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not submit twice while a login is in flight', async () => {
    let resolve
    auth.login.mockReturnValue(new Promise(r => { resolve = r }))
    renderLogin()

    fillCredentials()
    const button = screen.getByRole('button', { name: 'Log in' })
    fireEvent.click(button)
    await waitFor(() => expect(button).toBeDisabled())
    fireEvent.click(button)
    expect(auth.login).toHaveBeenCalledTimes(1)

    resolve({ id: 1, username: 'kapekost' })
    await screen.findByText('Home screen')
  })
})

describe('Login — forgot password', () => {
  it('asks for an email and posts it', async () => {
    auth.forgotPassword.mockResolvedValue({ status: 'ok' })
    renderLogin()

    fireEvent.click(screen.getByRole('button', { name: /forgot/i }))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'me@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))

    await waitFor(() => expect(auth.forgotPassword).toHaveBeenCalledWith('me@example.com'))
  })

  it('confirms without revealing whether the address has an account', async () => {
    auth.forgotPassword.mockResolvedValue({ status: 'ok' })
    renderLogin()

    fireEvent.click(screen.getByRole('button', { name: /forgot/i }))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'nobody@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(await screen.findByText(/if that address has an account/i)).toBeInTheDocument()
  })

  it('shows the same confirmation when the request itself fails', async () => {
    // The endpoint is deliberately uninformative; a network error must not
    // become the one signal that tells an attacker the address was real.
    auth.forgotPassword.mockRejectedValue(new Error('API POST /auth/forgot-password → 500'))
    renderLogin()

    fireEvent.click(screen.getByRole('button', { name: /forgot/i }))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'nobody@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(await screen.findByText(/if that address has an account/i)).toBeInTheDocument()
  })
})

describe('Login — the form itself', () => {
  it('lets you check what you typed, and hide it again', () => {
    renderLogin()
    const field = screen.getByLabelText('Password')
    expect(field).toHaveAttribute('type', 'password')

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(field).toHaveAttribute('type', 'text')

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(field).toHaveAttribute('type', 'password')
  })

  it('gives a password manager the field names it needs', () => {
    renderLogin()
    expect(screen.getByLabelText('Username')).toHaveAttribute('autocomplete', 'username')
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password')
  })

  it('announces the failure rather than only colouring it', async () => {
    auth.login.mockRejectedValue(apiError(401, 'invalid username or password'))
    renderLogin()

    fillCredentials('kapekost', 'wrong')
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('alert')).toHaveAttribute('aria-live', 'assertive')
  })

  // The intro has been wrong twice. First it explained the app's internals
  // ("Your workouts stay on this device's tracker either way -- logging in
  // just ties them to your own profile"); then, once #105 rewrote it in the
  // reader's terms, it promised workouts were "saved either way", which #86
  // falsified the day it closed the gate. It now says what is behind the
  // door, which is the only reason anyone standing here needs.
  it('says what is behind the door, without describing the implementation', () => {
    renderLogin()
    expect(screen.queryByText(/this device's tracker/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/either way/i)).not.toBeInTheDocument()
    expect(screen.getByText(/pick up where you left off/i)).toBeInTheDocument()
  })
})
