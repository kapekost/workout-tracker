import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { SessionProvider, useSession } from './session'

// onUnauthorized is the real seam api.js hands out, not a spy: these tests
// care that the provider survives registering, not what it registered.
vi.mock('../api', () => ({
  auth: { me: vi.fn(), logout: vi.fn(), login: vi.fn() },
  onUnauthorized: () => () => {},
}))
import { auth } from '../api'

function Probe() {
  const { profile, ready, signIn, signOut } = useSession()
  return (
    <div>
      <span data-testid="who">{profile ? profile.username : 'none'}</span>
      <span data-testid="ready">{String(ready)}</span>
      <button onClick={() => signIn({ id: 5, username: 'invited' })}>sign in</button>
      <button onClick={() => signOut()}>sign out</button>
    </div>
  )
}

beforeEach(() => { vi.clearAllMocks() })

describe('SessionProvider', () => {
  it('exposes the profile when /auth/me answers with one', async () => {
    auth.me.mockResolvedValue({ id: 1, username: 'kapekost', role: 'admin', icon: '💪' })
    render(<SessionProvider><Probe /></SessionProvider>)
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('kapekost'))
  })

  it('treats a 401 as "no session", not an error', async () => {
    const err = new Error('API GET /auth/me → 401')
    err.status = 401
    auth.me.mockRejectedValue(err)
    render(<SessionProvider><Probe /></SessionProvider>)
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))
    expect(screen.getByTestId('who')).toHaveTextContent('none')
  })

  it('signIn adopts a profile without another round trip', async () => {
    auth.me.mockRejectedValue(new Error('401'))
    render(<SessionProvider><Probe /></SessionProvider>)
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))
    fireEvent.click(screen.getByText('sign in'))
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('invited'))
    expect(auth.me).toHaveBeenCalledTimes(1)
  })

  it('signOut calls the API and clears the profile', async () => {
    auth.me.mockResolvedValue({ id: 1, username: 'kapekost' })
    auth.logout.mockResolvedValue(null)
    render(<SessionProvider><Probe /></SessionProvider>)
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('kapekost'))
    fireEvent.click(screen.getByText('sign out'))
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('none'))
    expect(auth.logout).toHaveBeenCalled()
  })

  it('clears the profile even when the logout request fails', async () => {
    auth.me.mockResolvedValue({ id: 1, username: 'kapekost' })
    auth.logout.mockRejectedValue(new Error('offline'))
    render(<SessionProvider><Probe /></SessionProvider>)
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('kapekost'))
    fireEvent.click(screen.getByText('sign out'))
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('none'))
  })
})

// A *failed* /auth/me settles and the door appears. A request that never
// settles at all does not -- and the app renders nothing until `ready`, so the
// whole screen stays blank with nothing to read and nothing to tap. That is the
// ~30s after a container restart, which scripts/deploy.sh already retries
// through.
describe('when /auth/me never answers at all', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('gives up waiting and shows the door rather than a blank page', async () => {
    auth.me.mockReturnValue(new Promise(() => {}))  // accepted, never answered
    render(<SessionProvider><Probe /></SessionProvider>)
    expect(screen.getByTestId('ready')).toHaveTextContent('false')

    await act(async () => { vi.advanceTimersByTime(5000) })

    expect(screen.getByTestId('ready')).toHaveTextContent('true')
    expect(screen.getByTestId('who')).toHaveTextContent('none')
  })

  it('leaves a lookup that answers in time alone, so the door never blinks', async () => {
    let answer
    auth.me.mockReturnValue(new Promise(resolve => { answer = resolve }))
    render(<SessionProvider><Probe /></SessionProvider>)

    await act(async () => { vi.advanceTimersByTime(4000) })
    expect(screen.getByTestId('ready')).toHaveTextContent('false')

    await act(async () => { answer({ id: 1, username: 'kapekost' }) })
    expect(screen.getByTestId('who')).toHaveTextContent('kapekost')
  })
})

describe('useSession outside a provider', () => {
  it('reports no session rather than throwing, so components stay renderable alone', () => {
    render(<Probe />)
    expect(screen.getByTestId('who')).toHaveTextContent('none')
    expect(screen.getByTestId('ready')).toHaveTextContent('true')
  })
})
