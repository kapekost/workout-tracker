import { describe, it, expect, vi } from 'vitest'
import { shouldCheckForUpdate, createUpdateStore } from './swUpdate'

describe('shouldCheckForUpdate', () => {
  // The service worker registers with registerType: 'autoUpdate', so finding a
  // new worker reloads the page. That is fine on any screen EXCEPT an active
  // workout, where the weight/reps inputs hold values the user has typed but
  // not yet logged — a reload there loses them mid-set.
  it('refuses while a workout is in progress', () => {
    expect(shouldCheckForUpdate('/workout/1')).toBe(false)
    expect(shouldCheckForUpdate('/workout/482')).toBe(false)
  })

  it('allows on every other screen', () => {
    expect(shouldCheckForUpdate('/')).toBe(true)
    expect(shouldCheckForUpdate('/progress')).toBe(true)
    expect(shouldCheckForUpdate('/history')).toBe(true)
    expect(shouldCheckForUpdate('/exercise/upper_a/bench_press')).toBe(true)
  })

  it('is not fooled by a path that merely contains the word', () => {
    // Only the /workout/ route is protected — not a page that happens to
    // mention it, which would silently disable updates everywhere.
    expect(shouldCheckForUpdate('/history/workout')).toBe(true)
    expect(shouldCheckForUpdate('/workouts')).toBe(true)
  })

  it('treats a missing pathname as unsafe', () => {
    // Unknown location: skip the check rather than risk reloading mid-set.
    // A missed check costs one deploy cycle; a bad reload costs logged work.
    expect(shouldCheckForUpdate(undefined)).toBe(false)
    expect(shouldCheckForUpdate(null)).toBe(false)
  })
})

describe('createUpdateStore', () => {
  it('starts with no update ready', () => {
    const store = createUpdateStore()
    expect(store.getSnapshot()).toBe(false)
  })

  it('markReady flips the snapshot and notifies subscribers', () => {
    const store = createUpdateStore()
    const cb = vi.fn()
    store.subscribe(cb)
    store.markReady()
    expect(store.getSnapshot()).toBe(true)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('subscribe returns an unsubscribe function that stops further notifications', () => {
    const store = createUpdateStore()
    const cb = vi.fn()
    const unsubscribe = store.subscribe(cb)
    unsubscribe()
    store.markReady()
    expect(cb).not.toHaveBeenCalled()
  })

  it('applyUpdate calls the action set via setAction', () => {
    const store = createUpdateStore()
    const action = vi.fn()
    store.setAction(action)
    store.applyUpdate()
    expect(action).toHaveBeenCalledTimes(1)
  })

  it('applyUpdate is a no-op if no action has been set yet', () => {
    const store = createUpdateStore()
    expect(() => store.applyUpdate()).not.toThrow()
  })

  it('checkNow calls update() on the registration set via setRegistration', () => {
    const store = createUpdateStore()
    const registration = { update: vi.fn() }
    store.setRegistration(registration)
    store.checkNow()
    expect(registration.update).toHaveBeenCalledTimes(1)
  })

  it('checkNow is a no-op if no registration has been set yet', () => {
    const store = createUpdateStore()
    expect(() => store.checkNow()).not.toThrow()
  })

  it('two createUpdateStore() instances do not share state', () => {
    const storeA = createUpdateStore()
    const storeB = createUpdateStore()
    storeA.markReady()
    expect(storeA.getSnapshot()).toBe(true)
    expect(storeB.getSnapshot()).toBe(false)
  })
})
