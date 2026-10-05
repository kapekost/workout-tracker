import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { StrictMode } from 'react'
import { SessionProvider, useSession } from './session'
import { apiReadsCacheName } from '../../apiCacheName.js'

// onUnauthorized is the real seam api.js hands out, not a spy, except where a
// test needs to fire it -- that is the 401 path, which no caller ever invokes
// directly, so it has to be captured here to be triggered.
const onUnauthorizedSpy = vi.fn(() => () => {})
vi.mock('../api', () => ({
  auth: { me: vi.fn(), logout: vi.fn(), login: vi.fn() },
  onUnauthorized: (...args) => onUnauthorizedSpy(...args),
}))
import { auth } from '../api'

// signOut (#124) sweeps every session's rest timer, not one -- it has no
// way to know which session ids exist, and restTimerStorage owns that
// prefix sweep. Mocked here so these tests assert *that* signOut calls it,
// not restTimerStorage's own internals (covered by restTimerStorage.test.js).
vi.mock('./restTimerStorage', () => ({
  clearAllRestTimers: vi.fn(),
}))
import { clearAllRestTimers } from './restTimerStorage'

function Probe() {
  const { profile, ready, signIn, signOut } = useSession()
  return (
    <div>
      <span data-testid="who">{profile ? profile.username : 'none'}</span>
      <span data-testid="ready">{String(ready)}</span>
      <button onClick={() => signIn({ id: 5, username: 'invited' })}>sign in</button>
      <button onClick={() => signIn({ id: 1, username: 'kapekost' })}>sign in again</button>
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

// #124: logout must leave nothing behind on the device -- the phone this app
// runs on goes to a gym, and "logged out" has to mean the next person holding
// it cannot read the previous person's training history, online or off.
describe('signOut wipes device-held data (#124)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('caches', {
      delete: vi.fn().mockResolvedValue(true),
      keys: vi.fn().mockResolvedValue([]),
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('sweeps every stored rest timer, not just the current session', async () => {
    auth.me.mockResolvedValue({ id: 1, username: 'kapekost' })
    auth.logout.mockResolvedValue(null)
    render(<SessionProvider><Probe /></SessionProvider>)
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('kapekost'))

    fireEvent.click(screen.getByText('sign out'))

    await waitFor(() => expect(clearAllRestTimers).toHaveBeenCalled())
  })

  it('purges the current build\'s cached API responses from Cache Storage', async () => {
    auth.me.mockResolvedValue({ id: 1, username: 'kapekost' })
    auth.logout.mockResolvedValue(null)
    render(<SessionProvider><Probe /></SessionProvider>)
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('kapekost'))

    fireEvent.click(screen.getByText('sign out'))

    await waitFor(() =>
      expect(caches.delete).toHaveBeenCalledWith(apiReadsCacheName(__APP_COMMIT__)),
    )
  })

  it('leaves the device-level rest-length preference alone -- it is not account data', async () => {
    localStorage.setItem('restPrefSec', '120')
    auth.me.mockResolvedValue({ id: 1, username: 'kapekost' })
    auth.logout.mockResolvedValue(null)
    render(<SessionProvider><Probe /></SessionProvider>)
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('kapekost'))

    fireEvent.click(screen.getByText('sign out'))

    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('none'))
    expect(localStorage.getItem('restPrefSec')).toBe('120')
  })

  // The acceptance criterion this whole issue turns on: "a logout that only
  // works with a network is not a logout." auth.logout() rejecting (offline,
  // or the Pi unreachable) must not skip a single wipe step.
  it('still wipes local data when logout is offline and the request rejects', async () => {
    auth.me.mockResolvedValue({ id: 1, username: 'kapekost' })
    auth.logout.mockRejectedValue(new Error('offline'))
    render(<SessionProvider><Probe /></SessionProvider>)
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('kapekost'))

    fireEvent.click(screen.getByText('sign out'))

    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('none'))
    expect(clearAllRestTimers).toHaveBeenCalled()
    expect(caches.delete).toHaveBeenCalledWith(apiReadsCacheName(__APP_COMMIT__))
  })

  it('does not throw when Cache Storage is unavailable (non-browser/test environments)', async () => {
    vi.stubGlobal('caches', undefined)
    auth.me.mockResolvedValue({ id: 1, username: 'kapekost' })
    auth.logout.mockResolvedValue(null)
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

// The cache that holds cached API response bodies is scoped to the build
// commit, so it cannot tell two accounts apart. On a phone that is handed
// around -- the family-shared case #124 exists for -- the previous account's
// real sets, notes and progress would be served to whoever signs in next.
describe('cached API responses never cross accounts', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('caches', {
      delete: vi.fn().mockResolvedValue(true),
      keys: vi.fn().mockResolvedValue([]),
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  // The cache is keyed by build commit and cannot tell accounts apart, so the
  // responses in it are the previous user's. This is what the offline-read
  // cache is *for* when it holds the account that is still signed in, which is
  // why loading must not clear it.
  it('keeps the cache on first load, so offline reads still work', async () => {
    auth.me.mockResolvedValue({ id: 1, username: 'kapekost' })
    render(<SessionProvider><Probe /></SessionProvider>)
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('kapekost'))

    expect(caches.delete).not.toHaveBeenCalled()
  })

  it('purges the api-reads cache when a different account signs in', async () => {
    auth.me.mockResolvedValue({ id: 1, username: 'kapekost' })
    render(<SessionProvider><Probe /></SessionProvider>)
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('kapekost'))
    expect(caches.delete).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('sign in'))

    await waitFor(() => expect(caches.delete)
      .toHaveBeenCalledWith(apiReadsCacheName(__APP_COMMIT__)))
  })

  it('does not purge when the same account signs in again', async () => {
    auth.me.mockResolvedValue({ id: 1, username: 'kapekost' })
    render(<SessionProvider><Probe /></SessionProvider>)
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('kapekost'))

    // The Login screen's own path: /auth/me already answered with this
    // account and the user just typed the password again.
    fireEvent.click(screen.getByText('sign in again'))

    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('kapekost'))
    expect(caches.delete).not.toHaveBeenCalled()
  })

  it('purges on the 401 path too, not only on an explicit sign out', async () => {
    const handlers = []
    onUnauthorizedSpy.mockImplementation((fn) => { handlers.push(fn) })
    auth.me.mockResolvedValue({ id: 1, username: 'kapekost' })
    render(<SessionProvider><Probe /></SessionProvider>)
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('kapekost'))
    expect(caches.delete).not.toHaveBeenCalled()

    // A data endpoint answers 401 mid-use: the session ended without anybody
    // touching sign out.
    await act(async () => { handlers.forEach((fn) => fn()) })

    await waitFor(() => expect(caches.delete)
      .toHaveBeenCalledWith(apiReadsCacheName(__APP_COMMIT__)))
  })

  // The purge has to run from an effect, not from inside a setProfile updater:
  // an updater must stay pure, and StrictMode (main.jsx) re-invokes it, which
  // would issue the delete twice for one account change.
  it('purges once per account change, even under StrictMode', async () => {
    auth.me.mockResolvedValue({ id: 1, username: 'kapekost' })
    render(
      <StrictMode>
        <SessionProvider><Probe /></SessionProvider>
      </StrictMode>,
    )
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('kapekost'))
    caches.delete.mockClear()

    fireEvent.click(screen.getByText('sign in'))

    await waitFor(() => expect(caches.delete).toHaveBeenCalled())
    expect(caches.delete).toHaveBeenCalledTimes(1)
  })
})

describe('useSession outside a provider', () => {
  it('reports no session rather than throwing, so components stay renderable alone', () => {
    render(<Probe />)
    expect(screen.getByTestId('who')).toHaveTextContent('none')
    expect(screen.getByTestId('ready')).toHaveTextContent('true')
  })
})
