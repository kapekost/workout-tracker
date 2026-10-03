import { describe, it, expect, vi } from 'vitest'
import { createNetworkStatusStore } from './networkStatus'

describe('createNetworkStatusStore', () => {
  it('starts live (not showing stale data)', () => {
    const store = createNetworkStatusStore()
    expect(store.getSnapshot()).toBe(false)
  })

  it('markStale flips the snapshot and notifies subscribers', () => {
    const store = createNetworkStatusStore()
    const cb = vi.fn()
    store.subscribe(cb)
    store.markStale()
    expect(store.getSnapshot()).toBe(true)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('markStale is a no-op notification-wise if already stale', () => {
    // The service worker can report a failed fetch on every cached-GET in a
    // single page load once offline -- one visible warning, not a spam of
    // re-renders for a state that hasn't actually changed.
    const store = createNetworkStatusStore()
    const cb = vi.fn()
    store.markStale()
    store.subscribe(cb)
    store.markStale()
    expect(cb).not.toHaveBeenCalled()
  })

  it('markLive clears a stale flag and notifies subscribers', () => {
    const store = createNetworkStatusStore()
    const cb = vi.fn()
    store.markStale()
    store.subscribe(cb)
    store.markLive()
    expect(store.getSnapshot()).toBe(false)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('markLive is a no-op notification-wise if already live', () => {
    const store = createNetworkStatusStore()
    const cb = vi.fn()
    store.subscribe(cb)
    store.markLive()
    expect(cb).not.toHaveBeenCalled()
  })

  it('subscribe returns an unsubscribe function that stops further notifications', () => {
    const store = createNetworkStatusStore()
    const cb = vi.fn()
    const unsubscribe = store.subscribe(cb)
    unsubscribe()
    store.markStale()
    expect(cb).not.toHaveBeenCalled()
  })

  it('handleMessage marks stale on the service worker\'s failed-fetch message', () => {
    const store = createNetworkStatusStore()
    store.handleMessage({ data: { type: 'API_NETWORK_UNREACHABLE' } })
    expect(store.getSnapshot()).toBe(true)
  })

  it('handleMessage marks live again on the recovered message', () => {
    const store = createNetworkStatusStore()
    store.markStale()
    store.handleMessage({ data: { type: 'API_NETWORK_RECOVERED' } })
    expect(store.getSnapshot()).toBe(false)
  })

  it('handleMessage ignores messages of any other shape or type', () => {
    const store = createNetworkStatusStore()
    store.handleMessage({ data: { type: 'SOME_OTHER_MESSAGE' } })
    expect(store.getSnapshot()).toBe(false)
    store.handleMessage({ data: null })
    store.handleMessage({})
    expect(store.getSnapshot()).toBe(false)
  })

  // Review finding: concurrent /api/* requests each report their own outcome
  // independently, so a slower, older request can fail *after* a newer one
  // already succeeded -- without a way to tell "older" from "newer", that
  // stale failure would stick the badge on forever. The service worker plugin
  // (vite.config.js) tags every message with a monotonically increasing seq.
  it('a lower-seq message arriving after a higher-seq one is ignored', () => {
    const store = createNetworkStatusStore()
    store.handleMessage({ data: { type: 'API_NETWORK_RECOVERED', seq: 2 } })
    store.handleMessage({ data: { type: 'API_NETWORK_UNREACHABLE', seq: 1 } })
    expect(store.getSnapshot()).toBe(false)
  })

  it('a higher-seq message always applies, live or stale', () => {
    const store = createNetworkStatusStore()
    store.handleMessage({ data: { type: 'API_NETWORK_UNREACHABLE', seq: 1 } })
    store.handleMessage({ data: { type: 'API_NETWORK_RECOVERED', seq: 2 } })
    expect(store.getSnapshot()).toBe(false)
  })

  it('messages with no seq (e.g. a hand-authored test message) always apply', () => {
    const store = createNetworkStatusStore()
    store.handleMessage({ data: { type: 'API_NETWORK_UNREACHABLE', seq: 5 } })
    store.handleMessage({ data: { type: 'API_NETWORK_RECOVERED' } })
    expect(store.getSnapshot()).toBe(false)
  })

  it('two createNetworkStatusStore() instances do not share state', () => {
    const storeA = createNetworkStatusStore()
    const storeB = createNetworkStatusStore()
    storeA.markStale()
    expect(storeA.getSnapshot()).toBe(true)
    expect(storeB.getSnapshot()).toBe(false)
  })
})
