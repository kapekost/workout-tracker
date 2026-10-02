import { api } from './api'

// api.js had no test file at all, which is why `api.put` shipped undefined and
// the per-exercise note save was silently broken behind a catch that showed
// "Failed to save note" while an optimistic local update made it look saved.
// The mock in pages/Workout.test.jsx mirrored that same omission -- it listed
// get/post/patch/delete and nothing more -- so 221 tests passed green over a
// feature that did not work.

describe('api', () => {
  let calls

  beforeEach(() => {
    calls = []
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      calls.push({ url, init })
      return { ok: true, status: 200, json: async () => ({ ok: true }) }
    }))
  })

  afterEach(() => vi.unstubAllGlobals())

  // The regression this file exists for.
  it('exposes put, which the note editor calls', () => {
    expect(typeof api.put).toBe('function')
  })

  it('put sends a PUT with a JSON body', async () => {
    await api.put('/exercises/bench/note', { note: 'pause on chest' })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('/api/exercises/bench/note')
    expect(calls[0].init.method).toBe('PUT')
    expect(calls[0].init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(calls[0].init.body)).toEqual({ note: 'pause on chest' })
  })

  it('covers every verb the backend exposes', () => {
    // main.py has a PUT (/api/exercises/{id}/note). A PUT that exists only
    // server-side is a half-finished contract; this pins the client side of it.
    for (const verb of ['get', 'post', 'patch', 'put', 'delete']) {
      expect(typeof api[verb], `${verb} is missing from api.js`).toBe('function')
    }
  })

  it('throws with the status in the message so callers can branch on it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 409, json: async () => ({}) })))
    // PersonalBests.jsx does err.message.includes('409') -- stringly-typed, and
    // the reason this helper's error shape is now asserted rather than implied.
    await expect(api.post('/personal-bests', {})).rejects.toThrow(/409/)
  })

  it('does not send a Content-Type when there is no body', async () => {
    await api.delete('/sessions/1')
    expect(calls[0].init.headers).toEqual({})
    expect(calls[0].init.body).toBeUndefined()
  })
})