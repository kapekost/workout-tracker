import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ScreenTracker from './ScreenTracker'

const trackMock = vi.fn()
vi.mock('../lib/analytics', () => ({ track: (...a) => trackMock(...a) }))

beforeEach(() => trackMock.mockClear())

describe('ScreenTracker', () => {
  it('emits screen_view on mount', () => {
    render(<MemoryRouter initialEntries={['/history']}><ScreenTracker /></MemoryRouter>)
    expect(trackMock).toHaveBeenCalledWith('screen_view', { path: '/history' })
  })

  it('emits time_on_screen on unmount', () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/history']}><ScreenTracker /></MemoryRouter>)
    trackMock.mockClear()
    unmount()
    expect(trackMock).toHaveBeenCalledWith('time_on_screen', expect.objectContaining({ path: '/history' }))
  })
})
