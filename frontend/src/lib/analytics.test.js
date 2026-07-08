import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { track, flush } from './analytics'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })))
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('analytics', () => {
  it('queues and flushes a batch as one POST', () => {
    track('screen_view', { path: '/' })
    track('set_logged', { reps: 8 })
    flush()
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, opts] = fetch.mock.calls[0]
    expect(url).toBe('/api/events')
    const body = JSON.parse(opts.body)
    expect(body).toHaveLength(2)
    expect(body[0].name).toBe('screen_view')
  })

  it('flush with an empty queue does nothing', () => {
    flush()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('a failing POST does not throw', () => {
    fetch.mockImplementation(() => Promise.reject(new Error('offline')))
    track('x')
    expect(() => flush()).not.toThrow()
  })
})
