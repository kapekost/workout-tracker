import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { api, auth, onUnauthorized } from './api'

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }
}

function noContentResponse() {
  return {
    ok: true,
    status: 204,
    // A real 204 has an empty body, so res.json() rejects.
    json: () => Promise.reject(new SyntaxError('Unexpected end of JSON input')),
  }
}

let stopListening = null

beforeEach(() => { globalThis.fetch = vi.fn() })
afterEach(() => {
  // onUnauthorized writes to module state that outlives a test file's mocks,
  // so an un-unregistered handler would fire inside the next test.
  stopListening?.()
  stopListening = null
  vi.restoreAllMocks()
})

function listenForExpiry() {
  const handler = vi.fn()
  stopListening = onUnauthorized(handler)
  return handler
}

describe('api request errors', () => {
  it('keeps the status in the message so existing callers can still match on it', async () => {
    fetch.mockResolvedValue(jsonResponse(409, { detail: 'already exists' }))
    await expect(api.post('/personal-bests', {})).rejects.toThrow('API POST /personal-bests → 409')
  })

  it('carries the status and the API detail on the error', async () => {
    fetch.mockResolvedValue(jsonResponse(401, { detail: 'invalid username or password' }))
    const err = await api.post('/auth/login', {}).catch(e => e)
    expect(err.status).toBe(401)
    expect(err.detail).toBe('invalid username or password')
  })

  it('leaves detail null when the error body is not a JSON object with a string detail', async () => {
    // FastAPI's 422 detail is a list of validation objects, not a message.
    fetch.mockResolvedValue(jsonResponse(422, { detail: [{ msg: 'field required' }] }))
    const err = await api.post('/auth/login', {}).catch(e => e)
    expect(err.detail).toBeNull()
  })

  it('leaves detail null when the error body is not JSON at all', async () => {
    fetch.mockResolvedValue({ ok: false, status: 502, json: () => Promise.reject(new Error('nope')) })
    const err = await api.get('/sessions').catch(e => e)
    expect(err.status).toBe(502)
    expect(err.detail).toBeNull()
  })
})

describe('api 204 handling', () => {
  it('resolves to null instead of choking on an empty body', async () => {
    fetch.mockResolvedValue(noContentResponse())
    await expect(api.post('/auth/logout')).resolves.toBeNull()
  })
})

describe('auth helpers', () => {
  it('login posts the credentials and returns the profile', async () => {
    fetch.mockResolvedValue(jsonResponse(200, { id: 1, username: 'kapekost', role: 'admin', icon: '💪' }))
    const profile = await auth.login('kapekost', 'correct horse battery')
    expect(profile.username).toBe('kapekost')
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('/api/auth/login')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ username: 'kapekost', password: 'correct horse battery' })
  })

  it('logout posts to the logout endpoint', async () => {
    fetch.mockResolvedValue(noContentResponse())
    await auth.logout()
    expect(fetch.mock.calls[0][0]).toBe('/api/auth/logout')
    expect(fetch.mock.calls[0][1].method).toBe('POST')
  })

  it('me reads the current session', async () => {
    fetch.mockResolvedValue(jsonResponse(200, { id: 1, username: 'kapekost' }))
    await auth.me()
    expect(fetch.mock.calls[0][0]).toBe('/api/auth/me')
    expect(fetch.mock.calls[0][1].method).toBe('GET')
  })

  it('setPassword posts the token and the new password', async () => {
    fetch.mockResolvedValue(jsonResponse(200, { id: 2, username: 'invited' }))
    await auth.setPassword('raw-token', 'a long enough password')
    expect(fetch.mock.calls[0][0]).toBe('/api/auth/set-password')
    expect(JSON.parse(fetch.mock.calls[0][1].body))
      .toEqual({ token: 'raw-token', password: 'a long enough password' })
  })

  it('forgotPassword posts the email', async () => {
    fetch.mockResolvedValue(jsonResponse(200, { status: 'ok' }))
    await auth.forgotPassword('someone@example.com')
    expect(fetch.mock.calls[0][0]).toBe('/api/auth/forgot-password')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ email: 'someone@example.com' })
  })
})

// The bridge from a plain module to the router. api.js has no navigation of
// its own, so a 401 that means "your session ended" is announced and someone
// else decides where that lands (SessionProvider clears the profile; App's
// guard renders the login screen).
describe('the expired-session signal', () => {
  it('announces a 401 from a data endpoint', async () => {
    const expired = listenForExpiry()
    fetch.mockResolvedValue(jsonResponse(401, { detail: 'not authenticated' }))

    await api.get('/sessions').catch(() => {})

    expect(expired).toHaveBeenCalledTimes(1)
  })

  it('still throws, so the calling page is not left awaiting a promise that never settles', async () => {
    listenForExpiry()
    fetch.mockResolvedValue(jsonResponse(401, { detail: 'not authenticated' }))
    await expect(api.post('/sessions', {})).rejects.toThrow('API POST /sessions → 401')
  })

  // The loop this guards against: the login screen posts a wrong password,
  // the 401 it gets back bounces the screen to the login screen, and the
  // message the user needed to read never renders.
  it.each([
    '/auth/me',
    '/auth/login',
    '/auth/set-password',
    '/auth/forgot-password',
    '/auth/logout',
  ])('stays quiet about a 401 from %s', async (path) => {
    const expired = listenForExpiry()
    fetch.mockResolvedValue(jsonResponse(401, { detail: 'invalid username or password' }))

    await api.post(path, {}).catch(() => {})

    expect(expired).not.toHaveBeenCalled()
  })

  it('says nothing about statuses that are not 401', async () => {
    const expired = listenForExpiry()
    fetch.mockResolvedValue(jsonResponse(403, { detail: 'admins only' }))

    await api.delete('/users/2').catch(() => {})

    expect(expired).not.toHaveBeenCalled()
  })

  it('stops announcing once the handler unregisters', async () => {
    const expired = vi.fn()
    onUnauthorized(expired)()
    fetch.mockResolvedValue(jsonResponse(401, { detail: 'not authenticated' }))

    await api.get('/sessions').catch(() => {})

    expect(expired).not.toHaveBeenCalled()
  })

  it('does not throw when nothing is listening', async () => {
    fetch.mockResolvedValue(jsonResponse(401, { detail: 'not authenticated' }))
    await expect(api.get('/sessions')).rejects.toThrow('→ 401')
  })
})
