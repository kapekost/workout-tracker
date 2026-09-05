import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from './App'

vi.mock('./api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  auth: {
    me: vi.fn(), login: vi.fn(), logout: vi.fn(),
    setPassword: vi.fn(), forgotPassword: vi.fn(),
  },
}))
vi.mock('./lib/analytics', () => ({ track: vi.fn(), flush: vi.fn() }))
import { api, auth } from './api'

function unauthenticated() {
  const err = new Error('API GET /auth/me → 401')
  err.status = 401
  auth.me.mockRejectedValue(err)
}

beforeEach(() => {
  vi.clearAllMocks()
  window.history.pushState({}, '', '/')
  api.get.mockImplementation(async (path) => {
    if (path === '/sessions') return []
    if (path === '/exercises/recency') return []
    if (path === '/profile/me') return { id: 1, username: 'kapekost', role: 'admin', icon: '💪' }
    throw new Error(`unmocked GET ${path}`)
  })
})

// The regression this whole step exists to protect: #105 ships the login
// screens, #86 turns the door. Until then a visitor with no session must get
// exactly the app they got yesterday.
describe('the app with no session', () => {
  it('renders Home instead of redirecting to /login', async () => {
    unauthenticated()
    render(<App />)

    await screen.findByText(/Next up/i)
    expect(window.location.pathname).toBe('/')
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Log in' })).not.toBeInTheDocument()
  })

  it('still navigates between screens', async () => {
    unauthenticated()
    render(<App />)
    await screen.findByText(/Next up/i)

    fireEvent.click(screen.getByRole('button', { name: /History/i }))

    await screen.findByRole('heading', { name: 'History' })
    expect(window.location.pathname).toBe('/history')
  })

  it('does not bounce a deep link to /login either', async () => {
    unauthenticated()
    window.history.pushState({}, '', '/history')
    render(<App />)

    await screen.findByRole('heading', { name: 'History' })
    expect(window.location.pathname).toBe('/history')
  })

  it('offers the login screen without forcing it on you', async () => {
    unauthenticated()
    render(<App />)
    await screen.findByText(/Next up/i)

    fireEvent.click(screen.getByRole('link', { name: 'Log in' }))

    await screen.findByLabelText('Username')
    expect(window.location.pathname).toBe('/login')
  })
})

describe('auth routes', () => {
  it('serves the login screen at /login', async () => {
    unauthenticated()
    window.history.pushState({}, '', '/login')
    render(<App />)

    await screen.findByLabelText('Username')
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
  })

  it('serves the set-password screen at the path the emails link to', async () => {
    unauthenticated()
    window.history.pushState({}, '', '/set-password?token=raw-token')
    render(<App />)

    await screen.findByLabelText('New password')
    expect(screen.getByRole('button', { name: 'Set password' })).toBeInTheDocument()
  })

  it('shows a real session in the top bar without changing what Home renders', async () => {
    auth.me.mockResolvedValue({ id: 2, username: 'invited', role: 'member', icon: '🔥' })
    render(<App />)

    await screen.findByText(/Next up/i)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument())
    expect(screen.getByText('invited')).toBeInTheDocument()
  })
})
