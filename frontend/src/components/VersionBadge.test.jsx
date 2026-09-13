import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import VersionBadge from './VersionBadge'

function renderBadge(store, path = '/', networkStore = makeNetworkStore()) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <VersionBadge store={store} networkStore={networkStore} />
    </MemoryRouter>
  )
}

// Same hand-rolled-stub reasoning as makeStore() below: these tests care
// about what VersionBadge renders for a given snapshot, not about
// networkStatus.js's own subscribe/notify plumbing (networkStatus.test.js's
// job).
function makeNetworkStore(over = {}) {
  return {
    subscribe: () => () => {},
    getSnapshot: () => false,
    ...over,
  }
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

  // #145: no indication today when the app is silently serving cached data
  // because the network is actually unreachable (e.g. VPN off) -- the
  // service worker's NetworkFirst fallback resolves 200 res.ok either way.
  it('shows no stale-data indicator when the network store reports live', () => {
    renderBadge(makeStore(), '/', makeNetworkStore({ getSnapshot: () => false }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows a stale-data indicator appended to the version row when the network store reports stale', () => {
    renderBadge(makeStore(), '/', makeNetworkStore({ getSnapshot: () => true }))
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('still shows the stale-data indicator alongside the version number, not instead of it', () => {
    renderBadge(makeStore(), '/', makeNetworkStore({ getSnapshot: () => true }))
    expect(screen.getByText(/^v \S+$/)).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('suppresses the stale-data indicator once a real update is ready (the row swaps entirely)', () => {
    renderBadge(makeStore({ getSnapshot: () => true }), '/', makeNetworkStore({ getSnapshot: () => true }))
    expect(screen.getByText('New version — tap to reload')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
