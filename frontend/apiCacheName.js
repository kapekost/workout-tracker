// The api-reads runtime cache's name is tied to the build commit (see #142):
// a fixed name across deploys let a device that cached real API responses
// before a security-relevant deploy (e.g. #86, which added the login
// requirement) keep serving that stale, pre-auth data indefinitely — only
// individual URLs get overwritten, and only on a live network hit. Scoping
// the cache name by commit means a new deploy always starts from an empty
// cache, so a response can never outlive the build it was fetched under.
export function apiReadsCacheName(commit) {
  return `api-reads-${commit}`
}
