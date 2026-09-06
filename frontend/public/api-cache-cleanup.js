// Sweeps every api-reads-* cache on activate, before this build's own
// api-reads-<commit> cache exists — workbox opens it lazily on the first
// matching fetch, so at activate time it can only ever be deleting caches
// left behind by older builds (see apiCacheName.js and #142).
//
// Spliced into the generated service worker via vite.config.js's
// workbox.importScripts: vite-plugin-pwa's generateSW mode has no other hook
// for custom activate-event code, and importScripts() loads this as a
// classic script (not an ES module), so it can't `import` apiCacheName.js's
// prefix directly — 'api-reads-' below is kept in sync with it by hand.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key.startsWith('api-reads-')).map((key) => caches.delete(key))),
    ),
  )
})
