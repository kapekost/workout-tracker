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
})
