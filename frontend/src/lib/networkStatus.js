// Whether the app is currently showing cached API data because the last
// live fetch actually failed to reach the network -- #145. Workbox's
// NetworkFirst handler for /api/* GETs (vite.config.js) already falls back to
// its cache on a failed fetch, but that fallback is invisible from the page's
// own fetch() call: it still resolves 200 res.ok either way (api.js's req()
// has no error path to hook). The service worker plugin in vite.config.js is
// the only place that actually sees the underlying fetch reject, so it
// postMessages the two events this store turns into a single boolean --
// main.jsx wires navigator.serviceWorker's 'message' event straight to
// handleMessage, same shape as swUpdate.js's registration wiring.
//
// A factory rather than a singleton so tests get an isolated instance each
// time instead of needing a reset hook between cases; `networkStatusStore`
// below is the one app-wide instance the real app wires up.
export function createNetworkStatusStore() {
  let stale = false
  const subscribers = new Set()

  function getSnapshot() {
    return stale
  }

  function subscribe(callback) {
    subscribers.add(callback)
    return () => subscribers.delete(callback)
  }

  function notify() {
    subscribers.forEach((callback) => callback())
  }

  function markStale() {
    if (stale) return
    stale = true
    notify()
  }

  function markLive() {
    if (!stale) return
    stale = false
    notify()
  }

  function handleMessage(event) {
    const type = event?.data?.type
    if (type === 'API_NETWORK_UNREACHABLE') markStale()
    else if (type === 'API_NETWORK_RECOVERED') markLive()
  }

  return { subscribe, getSnapshot, markStale, markLive, handleMessage }
}

export const networkStatusStore = createNetworkStatusStore()
