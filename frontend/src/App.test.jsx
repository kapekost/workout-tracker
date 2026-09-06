import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import App from './App'

// api.js announces an expired session through a callback it hands out --
// api.test.js owns which 401s do and do not announce. The mock captures that
// callback so a test can fire it, which is the half of the chain the app owns:
// what it does once it has been told.
const bridge = vi.hoisted(() => ({ sessionExpired: null }))

vi.mock('./api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  auth: {
    me: vi.fn(), login: vi.fn(), logout: vi.fn(),
    setPassword: vi.fn(), forgotPassword: vi.fn(),
  },
  onUnauthorized: (handler) => {
    bridge.sessionExpired = handler
    return () => { bridge.sessionExpired = null }
  },
}))
vi.mock('./lib/analytics', () => ({ track: vi.fn(), flush: vi.fn() }))
import { api, auth } from './api'

const PROFILE = { id: 1, username: 'kapekost', role: 'admin', icon: '💪' }

function unauthenticated() {
  const err = new Error('API GET /auth/me → 401')
  err.status = 401
  auth.me.mockRejectedValue(err)
}

function authenticated(profile = PROFILE) {
  auth.me.mockResolvedValue(profile)
}

function fillIn(username, password) {
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: username } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  bridge.sessionExpired = null
  window.history.pushState({}, '', '/')
  api.get.mockImplementation(async (path) => {
    if (path === '/sessions') return []
    if (path === '/exercises/recency') return []
    if (path === '/profile/me') return { id: 1, username: 'kapekost', role: 'admin', icon: '💪' }
    throw new Error(`unmocked GET ${path}`)
  })
})

// Flipped by #86, which is what this block was written for. Under #105 it
// asserted the opposite -- that shipping the login screens had gated nothing,
// and a visitor with no session still got exactly the app they got yesterday.
// #86 is the enforcement, so every assertion here now reads the other way up.
describe('the app with no session', () => {
  it('renders the login screen instead of Home', async () => {
    unauthenticated()
    render(<App />)

    await screen.findByLabelText('Username')
    expect(window.location.pathname).toBe('/login')
    expect(screen.queryByText(/Next up/i)).not.toBeInTheDocument()
  })

  it('sends a deep link to the door too', async () => {
    unauthenticated()
    window.history.pushState({}, '', '/history')
    render(<App />)

    await screen.findByLabelText('Username')
    expect(window.location.pathname).toBe('/login')
    expect(screen.queryByRole('heading', { name: 'History' })).not.toBeInTheDocument()
  })

  it('never mounts an app page, so nothing fires a request that only 401s back', async () => {
    unauthenticated()
    render(<App />)

    await screen.findByLabelText('Username')
    expect(api.get).not.toHaveBeenCalledWith('/exercises/recency')
  })

  it('replaces the bounced path rather than stacking it, so back leaves the app', async () => {
    unauthenticated()
    window.history.pushState({}, '', '/history')
    const before = window.history.length
    render(<App />)

    await screen.findByLabelText('Username')
    expect(window.history.length).toBe(before)
  })
})

// The window between the first paint and /auth/me answering exists on every
// single load. Rendering "logged out" during it blinks the login screen at a
// logged-in user on every refresh, which is the whole reason SessionProvider
// has a `ready` flag at all.
describe('while the session lookup is still in flight', () => {
  it('renders nothing -- not the app, and above all not the door', async () => {
    let answer
    auth.me.mockReturnValue(new Promise(resolve => { answer = resolve }))
    render(<App />)

    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
    expect(screen.queryByText(/Next up/i)).not.toBeInTheDocument()
    expect(screen.queryByText('🏋 Gym Tracker')).not.toBeInTheDocument()
    expect(window.location.pathname).toBe('/')

    await act(async () => { answer(PROFILE) })

    await screen.findByText(/Next up/i)
    expect(window.location.pathname).toBe('/')
  })
})

describe('the app with a session', () => {
  it('renders Home', async () => {
    authenticated()
    render(<App />)

    await screen.findByText(/Next up/i)
    expect(window.location.pathname).toBe('/')
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
  })

  it('still navigates between screens', async () => {
    authenticated()
    render(<App />)
    await screen.findByText(/Next up/i)

    fireEvent.click(screen.getByRole('button', { name: /History/i }))

    await screen.findByRole('heading', { name: 'History' })
    expect(window.location.pathname).toBe('/history')
  })

  it('serves a deep link straight, with no detour through the door', async () => {
    authenticated()
    window.history.pushState({}, '', '/history')
    render(<App />)

    await screen.findByRole('heading', { name: 'History' })
    expect(window.location.pathname).toBe('/history')
  })

  it('names the session in the top bar', async () => {
    authenticated({ id: 2, username: 'invited', role: 'member', icon: '🔥' })
    render(<App />)

    await screen.findByText(/Next up/i)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument())
    expect(screen.getByText('invited')).toBeInTheDocument()
  })
})

// #120 -- every deep link 404ing -- made the invite email unopenable for days.
// Gating /set-password would be the same outage from the other side, and a
// worse one: the token in that email is the only way into a brand-new account,
// so a redirect to a login screen the user has no password for yet would lock
// them out permanently.
describe('the screens that must stay reachable without a session', () => {
  it('serves the login screen at /login', async () => {
    unauthenticated()
    window.history.pushState({}, '', '/login')
    render(<App />)

    await screen.findByLabelText('Username')
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/login')
  })

  it('serves the set-password screen at the path the emails link to, token and all', async () => {
    unauthenticated()
    window.history.pushState({}, '', '/set-password?token=raw-token')
    render(<App />)

    await screen.findByLabelText('New password')
    expect(screen.getByRole('button', { name: 'Set password' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/set-password')
    expect(window.location.search).toBe('?token=raw-token')
  })
})

describe('logging in', () => {
  it('lands on the app', async () => {
    unauthenticated()
    auth.login.mockResolvedValue(PROFILE)
    render(<App />)
    await screen.findByLabelText('Username')

    fillIn('kapekost', 'correct horse battery')

    await screen.findByText(/Next up/i)
    expect(window.location.pathname).toBe('/')
  })

  it('returns to the screen the guard interrupted', async () => {
    unauthenticated()
    auth.login.mockResolvedValue(PROFILE)
    window.history.pushState({}, '', '/history')
    render(<App />)
    await screen.findByLabelText('Username')

    fillIn('kapekost', 'correct horse battery')

    await screen.findByRole('heading', { name: 'History' })
    expect(window.location.pathname).toBe('/history')
  })

  // The redirect loop this whole design exists to avoid: a wrong password is
  // itself a 401, and bouncing on it would replace the screen that was trying
  // to print the reason.
  it('shows a wrong password as a message on the login screen, not as a redirect', async () => {
    unauthenticated()
    const err = new Error('API POST /auth/login → 401')
    err.status = 401
    err.detail = 'invalid username or password'
    auth.login.mockRejectedValue(err)
    render(<App />)
    await screen.findByLabelText('Username')

    fillIn('kapekost', 'wrong')

    expect(await screen.findByRole('alert')).toHaveTextContent('invalid username or password')
    expect(window.location.pathname).toBe('/login')
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
  })
})

describe('a session that ends mid-use', () => {
  it('drops to the login screen when a data call reports the session gone', async () => {
    authenticated()
    window.history.pushState({}, '', '/history')
    render(<App />)
    await screen.findByRole('heading', { name: 'History' })

    await act(async () => { bridge.sessionExpired() })

    await screen.findByLabelText('Username')
    expect(window.location.pathname).toBe('/login')
  })

  it('remembers where it happened, so logging back in resumes there', async () => {
    authenticated()
    auth.login.mockResolvedValue(PROFILE)
    window.history.pushState({}, '', '/history')
    render(<App />)
    await screen.findByRole('heading', { name: 'History' })
    await act(async () => { bridge.sessionExpired() })
    await screen.findByLabelText('Username')

    fillIn('kapekost', 'correct horse battery')

    await screen.findByRole('heading', { name: 'History' })
  })

  it('logging out lands on the door as well', async () => {
    authenticated()
    auth.logout.mockResolvedValue(null)
    render(<App />)
    await screen.findByText(/Next up/i)

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))

    await screen.findByLabelText('Username')
    expect(window.location.pathname).toBe('/login')
  })
})

// Chrome, not gating -- shipped in #119/#123 and left alone by #86. The auth
// screens drop the app's primary nav so it cannot compete with the single
// action they exist to ask for.
describe('auth screens are chrome-free', () => {
  it('leaves the app nav off /login', async () => {
    unauthenticated()
    window.history.pushState({}, '', '/login')
    render(<App />)

    await screen.findByLabelText('Username')
    expect(screen.queryByRole('button', { name: /Progress/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /History/i })).not.toBeInTheDocument()
  })

  it('leaves it off /set-password too', async () => {
    unauthenticated()
    window.history.pushState({}, '', '/set-password?token=raw-token')
    render(<App />)

    await screen.findByLabelText('New password')
    expect(screen.queryByRole('button', { name: /History/i })).not.toBeInTheDocument()
  })

  // The way out that #123 added is for someone who tapped "Log in" from inside
  // the app and changed their mind. With no session there is no app behind the
  // door to change your mind back to -- the guard would bounce the tap straight
  // back here -- so it is offered only to a session that has somewhere to go.
  it('offers no way back out of the door when there is nothing behind it', async () => {
    unauthenticated()
    window.history.pushState({}, '', '/login')
    render(<App />)

    await screen.findByLabelText('Username')
    expect(screen.queryByRole('link', { name: 'Back to workouts' })).not.toBeInTheDocument()
  })

  it('brings the nav straight back on the way out, for a session that has one', async () => {
    authenticated()
    window.history.pushState({}, '', '/login')
    render(<App />)
    await screen.findByLabelText('Username')

    fireEvent.click(screen.getByRole('link', { name: 'Back to workouts' }))

    await screen.findByText(/Next up/i)
    expect(screen.getByRole('button', { name: /History/i })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/')
  })
})
