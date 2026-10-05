// The service worker's api-reads cache is keyed by build commit alone, so it
// has no way to tell one account's cached responses from another's. Everything
// that identifies *who* is logged in is therefore excluded from it, and what
// remains is purged whenever the account changes (see lib/session.jsx).
//
// vite.config.js passes this exact function to workbox as the runtimeCaching
// urlPattern. workbox-build embeds a function's own toString(), so it cannot
// close over module scope -- which is why the exclusions live in here as a
// returned closure rather than as constants read at match time.
export function isApiReadCacheable({ url, request }) {
  const path = url.pathname
  if (!path.startsWith('/api/')) return false
  if (request.method !== 'GET') return false
  // Identity. A cached /auth/me answers 200 with the previous account's name,
  // which both reveals it and makes the app render as them, and because the
  // response is a 200 nothing triggers the 401 handler that would clear it.
  if (path.startsWith('/api/auth/')) return false
  if (path.startsWith('/api/profile/')) return false
  // The admin namespace: a role-gated read that must reflect the session that
  // asked, not whatever one was cached first.
  if (path.startsWith('/api/admin/')) return false
  // The data-safety/export endpoint must never be served stale from the cache.
  if (path.startsWith('/api/export')) return false
  return true
}
