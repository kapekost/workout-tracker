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
  //
  // The live-region span stays mounted at rest regardless of stale/live --
  // only its content toggles. Review finding: a screen reader keys an
  // announcement off a *mutation inside* an already-present live region, not
  // off one that appears fully-formed -- conditionally mounting the whole
  // span would mean a network drop mid-session, the exact moment this exists
  // to help, may announce nothing.
  it('shows no stale-data indicator when the network store reports live', () => {
    renderBadge(makeStore(), '/', makeNetworkStore({ getSnapshot: () => false }))
    expect(screen.getByRole('status')).toHaveTextContent('')
  })

  it('shows a stale-data indicator appended to the version row when the network store reports stale', () => {
    renderBadge(makeStore(), '/', makeNetworkStore({ getSnapshot: () => true }))
    expect(screen.getByRole('status').querySelector('svg')).toBeInTheDocument()
  })

  it('still shows the stale-data indicator alongside the version number, not instead of it', () => {
    renderBadge(makeStore(), '/', makeNetworkStore({ getSnapshot: () => true }))
    expect(screen.getByText(/^v \S+$/)).toBeInTheDocument()
    expect(screen.getByRole('status').querySelector('svg')).toBeInTheDocument()
  })

  it('suppresses the stale-data indicator once a real update is ready (the row swaps entirely)', () => {
    renderBadge(makeStore({ getSnapshot: () => true }), '/', makeNetworkStore({ getSnapshot: () => true }))
    expect(screen.getByText('New version — tap to reload')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

// ── Wave 1.7, 2026-10-03 design review ──
// This was a 12px aria-hidden glyph with no text anywhere: nothing to read and
// nothing announced. Note the aria-hidden was on the <svg>, not on the
// role="status" span, so the live region was never hidden — putting words inside
// it is all that was needed.
describe('VersionBadge when the network drops', () => {
  const staleNetwork = () => makeNetworkStore({ getSnapshot: () => true })

  it('says something in words, not just a symbol', () => {
    renderBadge(makeStore(), '/', staleNetwork())
    expect(screen.getByText(/data may be old/i)).toBeInTheDocument()
  })

  it('never says "offline" — stale also fires on mere slowness', () => {
    // networkStatus.js marks stale on the SW's 4s NetworkFirst race resolving
    // the page's own fetch from cache, so the network is often fine.
    renderBadge(makeStore(), '/', staleNetwork())
    expect(screen.queryByText(/offline/i)).not.toBeInTheDocument()
  })

  it('the words are not inside an aria-hidden subtree', () => {
    renderBadge(makeStore(), '/', staleNetwork())
    const el = screen.getByText(/data may be old/i)
    expect(el.closest('[aria-hidden="true"]')).toBeNull()
  })

  it('the live region announces the full sentence, not just two words', () => {
    renderBadge(makeStore(), '/', staleNetwork())
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-atomic', 'true')
    expect(status).toHaveTextContent(/network unreachable/i)
  })

  it('says nothing at rest', () => {
    renderBadge(makeStore(), '/', makeNetworkStore())
    expect(screen.queryByText(/data may be old/i)).not.toBeInTheDocument()
  })
})
