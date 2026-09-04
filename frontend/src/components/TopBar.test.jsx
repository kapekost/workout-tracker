import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TopBar from './TopBar'

vi.mock('../api', () => ({
  api: { get: vi.fn() },
}))
import { api } from '../api'

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
