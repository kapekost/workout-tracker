import { describe, it, expect } from 'vitest'
import { shouldCheckForUpdate } from './swUpdate'

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
