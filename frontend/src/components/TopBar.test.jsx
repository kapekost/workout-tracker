import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TopBar from './TopBar'
import { SessionProvider } from '../lib/session'

vi.mock('../api', () => ({
  api: { get: vi.fn() },
  auth: { me: vi.fn(), logout: vi.fn() },
}))
import { api, auth } from '../api'

function renderTopBar() {
  return render(<MemoryRouter><TopBar /></MemoryRouter>)
}

beforeEach(() => { vi.clearAllMocks() })

describe('TopBar', () => {
  it('shows the active profile\'s icon and username once loaded', async () => {
    api.get.mockResolvedValue({ id: 1, username: 'kapekost', role: 'admin', icon: '💪' })
    renderTopBar()
    await waitFor(() => expect(screen.getByText('kapekost')).toBeInTheDocument())
    expect(screen.getByText('💪')).toBeInTheDocument()
  })

  it('falls back to a generic icon when the profile has none set', async () => {
    api.get.mockResolvedValue({ id: 2, username: 'other', role: 'member', icon: null })
    renderTopBar()
    await waitFor(() => expect(screen.getByText('other')).toBeInTheDocument())
    expect(screen.getByText('👤')).toBeInTheDocument()
  })

  it('renders the app name even if the profile fetch fails', async () => {
    api.get.mockRejectedValue(new Error('network'))
    renderTopBar()
    await screen.findByText('🏋 Gym Tracker')
    expect(screen.queryByText('kapekost')).not.toBeInTheDocument()
  })

  it('keeps the brand title on one line and truncates a long username instead', async () => {
    // jsdom doesn't do real layout, so this can't see actual wrapping the way
    // a browser would -- it locks in the specific style properties (nowrap +
    // no shrink on the title, ellipsis + shrinkable on the username) that
    // prevent the title from wrapping to two lines when a long username
    // competes for space in the same flex row (verified in a real browser
    // during review).
    api.get.mockResolvedValue({ id: 3, username: 'alexandra_thompson', role: 'member', icon: '🔥' })
    renderTopBar()
    const username = await screen.findByText('alexandra_thompson')
    const title = screen.getByText('🏋 Gym Tracker')
    expect(title).toHaveStyle({ whiteSpace: 'nowrap', flexShrink: '0' })
    expect(username).toHaveStyle({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
  })
})

describe('TopBar session state', () => {
  function renderWithSession() {
    return render(
      <MemoryRouter>
        <SessionProvider><TopBar /></SessionProvider>
      </MemoryRouter>
    )
  }

  it('offers a way to log in when there is no session', async () => {
    api.get.mockResolvedValue({ id: 1, username: 'kapekost', role: 'admin', icon: '💪' })
    auth.me.mockRejectedValue(Object.assign(new Error('401'), { status: 401 }))
    renderWithSession()

    const link = await screen.findByRole('link', { name: 'Log in' })
    expect(link).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument()
  })

  it('shows the session profile and a way to log out when there is one', async () => {
    api.get.mockResolvedValue({ id: 1, username: 'seeded', role: 'admin', icon: '💪' })
    auth.me.mockResolvedValue({ id: 2, username: 'invited', role: 'member', icon: '🔥' })
    renderWithSession()

    await screen.findByRole('button', { name: 'Log out' })
    // The session's own profile wins over /profile/me's acting profile.
    expect(screen.getByText('invited')).toBeInTheDocument()
    expect(screen.getByText('🔥')).toBeInTheDocument()
    expect(screen.queryByText('seeded')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument()
  })

  it('logging out clears the session and returns the bar to its logged-out shape', async () => {
    api.get.mockRejectedValue(new Error('network'))
    auth.me.mockResolvedValue({ id: 2, username: 'invited', role: 'member', icon: '🔥' })
    auth.logout.mockResolvedValue(null)
    renderWithSession()

    fireEvent.click(await screen.findByRole('button', { name: 'Log out' }))

    await screen.findByRole('link', { name: 'Log in' })
    expect(auth.logout).toHaveBeenCalled()
    expect(screen.queryByText('invited')).not.toBeInTheDocument()
  })
})
