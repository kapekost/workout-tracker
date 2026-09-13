import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import VersionBadge from './VersionBadge'

function renderBadge(store, path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <VersionBadge store={store} />
    </MemoryRouter>
  )
}

// A hand-rolled stub rather than createUpdateStore() for most cases here:
// these tests care about WHICH store method got called and with what ready
// value, not about the store's own subscribe/notify plumbing -- that's
// swUpdate.test.js's job.
function makeStore(over = {}) {
  return {
    subscribe: () => () => {},
    getSnapshot: () => false,
    checkNow: vi.fn(),
    applyUpdate: vi.fn(),
    ...over,
  }
}

describe('VersionBadge', () => {
  it("shows the running build's commit at rest", () => {
    renderBadge(makeStore())
    // Same assertion Home.test.jsx's VersionStamp test already uses.
    expect(screen.getByText(/^v \S+$/)).toBeInTheDocument()
  })

  it('renders a check-for-update control at rest', () => {
    renderBadge(makeStore())
    expect(screen.getByRole('button', { name: 'Check for update' })).toBeInTheDocument()
  })

  it("tapping check calls the store's checkNow", () => {
    const store = makeStore()
    renderBadge(store)
    fireEvent.click(screen.getByRole('button', { name: 'Check for update' }))
    expect(store.checkNow).toHaveBeenCalledTimes(1)
  })

  it('shows a transient "Checking…" state after tapping check', () => {
    renderBadge(makeStore())
    fireEvent.click(screen.getByRole('button', { name: 'Check for update' }))
    expect(screen.getByText('Checking…')).toBeInTheDocument()
  })

  it('swaps to the update-ready prompt once the store reports ready', () => {
    renderBadge(makeStore({ getSnapshot: () => true }))
    expect(screen.getByText('New version — tap to reload')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Check for update' })).not.toBeInTheDocument()
  })

  it("tapping the ready prompt calls the store's applyUpdate", () => {
    const store = makeStore({ getSnapshot: () => true })
    renderBadge(store)
    fireEvent.click(screen.getByText('New version — tap to reload'))
    expect(store.applyUpdate).toHaveBeenCalledTimes(1)
  })

  it('suppresses the ready prompt while a workout is in progress', () => {
    renderBadge(makeStore({ getSnapshot: () => true }), '/workout/9')
    expect(screen.queryByText('New version — tap to reload')).not.toBeInTheDocument()
    expect(screen.getByText(/^v \S+$/)).toBeInTheDocument()
  })

  it('shows the ready prompt again once off the workout screen', () => {
    renderBadge(makeStore({ getSnapshot: () => true }), '/progress')
    expect(screen.getByText('New version — tap to reload')).toBeInTheDocument()
  })
})
