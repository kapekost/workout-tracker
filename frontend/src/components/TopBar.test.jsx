import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TopBar from './TopBar'
import { SessionProvider } from '../lib/session'

vi.mock('../api', () => ({
  api: { get: vi.fn() },
  auth: { me: vi.fn(), logout: vi.fn() },
  onUnauthorized: () => () => {},
}))
import { api, auth } from '../api'

function renderTopBar() {
  return render(
    <MemoryRouter>
      <SessionProvider><TopBar /></SessionProvider>
    </MemoryRouter>
  )
}

function signedInAs(profile) {
  auth.me.mockResolvedValue(profile)
}

function renderTopBarAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SessionProvider><TopBar /></SessionProvider>
    </MemoryRouter>
  )
}

function signedOut() {
  auth.me.mockRejectedValue(Object.assign(new Error('401'), { status: 401 }))
}

beforeEach(() => { vi.clearAllMocks() })

describe('TopBar', () => {
  it("shows the session profile's icon and username once loaded", async () => {
    signedInAs({ id: 1, username: 'kapekost', role: 'admin', icon: '💪' })
    renderTopBar()
    await waitFor(() => expect(screen.getByText('kapekost')).toBeInTheDocument())
    expect(screen.getByText('💪')).toBeInTheDocument()
  })

  it('falls back to a generic icon when the profile has none set', async () => {
    signedInAs({ id: 2, username: 'other', role: 'member', icon: null })
    renderTopBar()
    await waitFor(() => expect(screen.getByText('other')).toBeInTheDocument())
    expect(screen.getByText('👤')).toBeInTheDocument()
  })

  it('renders the app name even if the session lookup fails', async () => {
    auth.me.mockRejectedValue(new Error('network'))
    renderTopBar()
    await screen.findByText('🏋 Gym Tracker')
    expect(screen.queryByText('kapekost')).not.toBeInTheDocument()
  })

  // The bug this file exists to keep fixed: the bar used to fall back to
  // /profile/me, so a logged-out visitor saw a username AND a "Log in" link --
  // it read as "signed in, with no way to sign out". Identity in this bar means
  // a session and nothing else.
  it('names nobody when there is no session, even though writes still land on a profile', async () => {
    signedOut()
    api.get.mockResolvedValue({ id: 1, username: 'kapekost', role: 'admin', icon: '💪' })
    renderTopBar()

    await screen.findByRole('link', { name: 'Log in' })
    expect(screen.queryByText('kapekost')).not.toBeInTheDocument()
    expect(screen.queryByText('💪')).not.toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalledWith('/profile/me')
  })

  it('keeps the brand title on one line and truncates a long username instead', async () => {
    // jsdom doesn't do real layout, so this can't see actual wrapping the way
    // a browser would -- it locks in the specific style properties (nowrap +
    // no shrink on the title, ellipsis + shrinkable on the username) that
    // prevent the title from wrapping to two lines when a long username
    // competes for space in the same flex row (verified in a real browser
    // during review).
    signedInAs({ id: 3, username: 'alexandra_thompson', role: 'member', icon: '🔥' })
    renderTopBar()
    const username = await screen.findByText('alexandra_thompson')
    const title = screen.getByText('🏋 Gym Tracker')
    expect(title).toHaveStyle({ whiteSpace: 'nowrap', flexShrink: '0' })
    expect(username).toHaveStyle({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
  })
})

describe('TopBar session state', () => {
  it('offers a way to log in when there is no session', async () => {
    signedOut()
    renderTopBar()

    const link = await screen.findByRole('link', { name: 'Log in' })
    expect(link).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument()
  })

  it('shows the session profile and a way to log out when there is one', async () => {
    signedInAs({ id: 2, username: 'invited', role: 'member', icon: '🔥' })
    renderTopBar()

    await screen.findByRole('button', { name: 'Log out' })
    expect(screen.getByText('invited')).toBeInTheDocument()
    expect(screen.getByText('🔥')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument()
  })

  it('logging out clears the session and returns the bar to its logged-out shape', async () => {
    signedInAs({ id: 2, username: 'invited', role: 'member', icon: '🔥' })
    auth.logout.mockResolvedValue(null)
    renderTopBar()

    fireEvent.click(await screen.findByRole('button', { name: 'Log out' }))

    await screen.findByRole('link', { name: 'Log in' })
    expect(auth.logout).toHaveBeenCalled()
    expect(screen.queryByText('invited')).not.toBeInTheDocument()
  })
})

// The owner's report, in their words: "after i press login the login screen
// prints it twice, messy very messy". It was actually three times -- this
// bar's "Log in" link, this bar's page-label eyebrow reading "LOG IN" beside
// it, and the page's own <h1>. On /set-password the same collision read
// "Log in  PASSWORD" above a heading that said "Set your password".
describe('TopBar on the auth screens', () => {
  it('says "log in" exactly nowhere on /login, leaving the page its own heading', async () => {
    signedOut()
    renderTopBarAt('/login')

    await screen.findByText('🏋 Gym Tracker')
    // Covers both offenders at once: the eyebrow is uppercased in CSS, so its
    // DOM text is the same string the link carried.
    expect(screen.queryByText('Log in')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument()
  })

  it('drops the page label on /set-password too', async () => {
    signedOut()
    renderTopBarAt('/set-password')

    await screen.findByText('🏋 Gym Tracker')
    expect(screen.queryByText('Password')).not.toBeInTheDocument()
    expect(screen.queryByText('Log in')).not.toBeInTheDocument()
  })

  // For someone who tapped "Log in" from inside the app and changed their
  // mind. Since #86 closed the gate there is nothing behind the door without a
  // session, so the way back is offered only to one that has somewhere to go --
  // otherwise the tap would land on the guard and bounce straight back here.
  it('offers a session a way back into the app, since NavBar is gone there', async () => {
    signedInAs({ id: 2, username: 'invited', role: 'member', icon: '🔥' })
    renderTopBarAt('/login')

    expect(await screen.findByRole('link', { name: 'Back to workouts' }))
      .toHaveAttribute('href', '/')
  })

  it('offers no way back when there is no session behind the door', async () => {
    signedOut()
    renderTopBarAt('/login')

    await screen.findByText('🏋 Gym Tracker')
    expect(screen.queryByRole('link', { name: 'Back to workouts' })).not.toBeInTheDocument()
  })

  it('leaves identity out of the bar on an auth screen', async () => {
    signedInAs({ id: 2, username: 'invited', role: 'member', icon: '🔥' })
    renderTopBarAt('/login')

    await screen.findByRole('link', { name: 'Back to workouts' })
    expect(screen.queryByText('invited')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument()
  })

  it('still labels the ordinary app screens and still offers the door', async () => {
    signedOut()
    renderTopBarAt('/history')

    expect(await screen.findByRole('link', { name: 'Log in' })).toBeInTheDocument()
    expect(screen.getByText('History')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Back to workouts' })).not.toBeInTheDocument()
  })

  // The bar's control and the mint page label sat adjacent in the same accent
  // colour and read as one blob. Accent belongs to the screen's own primary
  // action, which is never in this bar.
  it('keeps the session control quiet rather than accented', async () => {
    signedOut()
    renderTopBarAt('/')

    expect(await screen.findByRole('link', { name: 'Log in' }))
      .toHaveStyle({ color: 'rgb(156, 163, 175)' })
  })
})
