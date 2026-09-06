import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { ActiveSessionProvider, useActiveSession } from './activeSession'
import { SessionContext } from './session'

vi.mock('../api', () => ({
  api: { get: vi.fn(), delete: vi.fn() },
  auth: { me: vi.fn(), logout: vi.fn() },
  onUnauthorized: () => () => {},
}))
import { api } from '../api'

const PROFILE = { id: 1, username: 'kapekost', role: 'admin' }

function Probe() {
  const { active, ready, discard } = useActiveSession()
  return (
    <div>
      <span data-testid="active">{active ? active.id : 'none'}</span>
      <span data-testid="ready">{String(ready)}</span>
      <button onClick={() => discard(active.id)}>discard</button>
    </div>
  )
}

// /sessions is gated (#86), so the provider is only meaningful under a session.
// The context is supplied directly rather than through SessionProvider: what is
// under test is what the provider does as `profile` changes, not how the
// profile is obtained.
function renderWith(profile) {
  const session = { profile, ready: true, signIn: () => {}, signOut: async () => {} }
  const view = render(
    <SessionContext.Provider value={session}>
      <ActiveSessionProvider><Probe /></ActiveSessionProvider>
    </SessionContext.Provider>
  )
  return {
    ...view,
    setProfile: (next) => view.rerender(
      <SessionContext.Provider value={{ ...session, profile: next }}>
        <ActiveSessionProvider><Probe /></ActiveSessionProvider>
      </SessionContext.Provider>
    ),
  }
}

beforeEach(() => { vi.clearAllMocks() })

describe('ActiveSessionProvider', () => {
  it('exposes the incomplete session after mount', async () => {
    api.get.mockResolvedValue([{ id: 7, completed: 0 }])
    renderWith(PROFILE)
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('7'))
  })

  it('ready becomes true after the mount fetch resolves', async () => {
    api.get.mockResolvedValue([])
    renderWith(PROFILE)
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))
  })

  it('discard deletes then refreshes to no active', async () => {
    api.get.mockResolvedValueOnce([{ id: 7, completed: 0 }])
    api.delete.mockResolvedValue({ deleted: true })
    api.get.mockResolvedValueOnce([{ id: 7, completed: 1 }])
    renderWith(PROFILE)
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('7'))
    fireEvent.click(screen.getByText('discard'))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/sessions/7'))
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('none'))
  })

  it('asks for nothing with no session, because /sessions would only 401', () => {
    api.get.mockResolvedValue([])
    renderWith(null)
    expect(api.get).not.toHaveBeenCalled()
  })

  it('fetches as soon as a session appears, without waiting for a reload', async () => {
    api.get.mockResolvedValue([{ id: 12, completed: 0 }])
    const { setProfile } = renderWith(null)

    setProfile(PROFILE)

    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('12'))
  })

  it('drops the active session when the profile goes, so no banner outlives it', async () => {
    api.get.mockResolvedValue([{ id: 12, completed: 0 }])
    const { setProfile } = renderWith(PROFILE)
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('12'))

    setProfile(null)

    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('none'))
  })
})
