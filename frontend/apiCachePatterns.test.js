import { describe, it, expect } from 'vitest'
import { isApiReadCacheable } from './apiCachePatterns.js'

// The service worker's own urlPattern is embedded by workbox-build from the
// function's toString(), so the predicate is the only way to test it without
// building the app and grepping dist/sw.js. vite.config.js must keep passing
// *this* function, not a copy of it -- apiCachePatterns.test.js below is what
// stops the two drifting.
const url = (pathname) => ({ pathname, hostname: 'example.test' })
const get = { method: 'GET' }
const req = (pathname, method = 'GET') => ({ url: url(pathname), request: { method } })

describe('isApiReadCacheable', () => {
  it('caches the offline-read endpoints it exists for', () => {
    expect(isApiReadCacheable(req('/api/sessions'))).toBe(true)
    expect(isApiReadCacheable(req('/api/progress'))).toBe(true)
    expect(isApiReadCacheable(req('/api/notes'))).toBe(true)
    expect(isApiReadCacheable(req('/api/plan'))).toBe(true)
  })

  // Who is logged in is not offline-readable data: a cached /auth/me is a
  // previous account's identity served to whoever is holding the phone now,
  // and the 401 handler cannot fire because nothing 401s. The same is true of
  // /profile/me, which names the account and carries its settings.
  it('never caches identity', () => {
    expect(isApiReadCacheable(req('/api/auth/me'))).toBe(false)
    expect(isApiReadCacheable(req('/api/auth/login'))).toBe(false)
    expect(isApiReadCacheable(req('/api/auth/forgot-password'))).toBe(false)
    expect(isApiReadCacheable(req('/api/profile/me'))).toBe(false)
  })

  it('never caches the export, which must never be served stale', () => {
    expect(isApiReadCacheable(req('/api/export'))).toBe(false)
    expect(isApiReadCacheable(req('/api/admin/backup-status'))).toBe(false)
  })

  it('never caches a write', () => {
    expect(isApiReadCacheable(req('/api/sessions', 'POST'))).toBe(false)
    expect(isApiReadCacheable(req('/api/sessions/1', 'PATCH'))).toBe(false)
    expect(isApiReadCacheable(req('/api/sessions/1/sets/2', 'DELETE'))).toBe(false)
  })

  it('ignores paths that are not this app\'s API', () => {
    expect(isApiReadCacheable(req('/apiary'))).toBe(false)
    expect(isApiReadCacheable(req('/assets/index.js'))).toBe(false)
    expect(isApiReadCacheable(req('/'))).toBe(false)
  })
})
