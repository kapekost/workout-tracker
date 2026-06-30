import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ResumeBanner from './ResumeBanner'
import { ActiveSessionContext } from '../lib/activeSession'

function renderBanner(value, path = '/progress') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ActiveSessionContext.Provider value={value}>
        <ResumeBanner />
      </ActiveSessionContext.Provider>
    </MemoryRouter>
  )
}

const activeVal = (over = {}) => ({
  active: { id: 9, workout_day: 'upper_a' },
  refresh: vi.fn(),
  discard: vi.fn(),
  ...over,
})

describe('ResumeBanner', () => {
  it('renders nothing when there is no active session', () => {
    const { container } = renderBanner({ active: null, refresh: vi.fn(), discard: vi.fn() })
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the resume affordance when a session is active', () => {
    renderBanner(activeVal())
    expect(screen.getByText(/in progress/)).toBeInTheDocument()
    expect(screen.getByText('Resume ›')).toBeInTheDocument()
  })

  it("hides on the active session's own page", () => {
    const { container } = renderBanner(activeVal(), '/workout/9')
    expect(container).toBeEmptyDOMElement()
  })

  it('discard requires confirm then calls discard', () => {
    const discard = vi.fn()
    renderBanner(activeVal({ discard }))
    fireEvent.click(screen.getByRole('button', { name: 'discard session' }))
    expect(screen.getByText('Discard?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'confirm discard' }))
    expect(discard).toHaveBeenCalledWith(9)
  })

  it('cancel keeps the session', () => {
    const discard = vi.fn()
    renderBanner(activeVal({ discard }))
    fireEvent.click(screen.getByRole('button', { name: 'discard session' }))
    fireEvent.click(screen.getByRole('button', { name: 'cancel discard' }))
    expect(screen.queryByText('Discard?')).not.toBeInTheDocument()
    expect(discard).not.toHaveBeenCalled()
  })
})
