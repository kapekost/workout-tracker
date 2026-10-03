import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'
import { configDefaults } from 'vitest/config'
import { apiReadsCacheName } from './apiCacheName.js'

// Docker builds have no .git (see .dockerignore) — the commit comes in as the
// APP_COMMIT build arg there; local dev/test falls back to git, then "dev".
const appCommit = process.env.APP_COMMIT
  || (() => { try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return 'dev' } })()

export default defineConfig({
  define: { __APP_COMMIT__: JSON.stringify(appCommit) },
  plugins: [
    react(),
    VitePWA({
      // 'prompt', not 'autoUpdate': 'autoUpdate' never wires onNeedRefresh at
      // all -- it calls self.skipWaiting()/clientsClaim() unconditionally the
      // moment the generated worker's top-level code runs, so there is no
      // "waiting" state to prompt from and no gate on the RELOAD, only on
      // when the update CHECK runs (see swUpdate.js). 'prompt' instead emits
      // a worker that skips waiting only on an explicit postMessage, which is
      // what main.jsx's onNeedRefresh/updateServiceWorker wiring (#125) needs
      // to hold a found update until the user taps to apply it.
      registerType: 'prompt',
      // main.jsx registers explicitly (it needs the registration object to
      // drive its own update checks), so don't also inject a register script.
      injectRegister: null,
      includeAssets: ['favicon-64.png', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Gym Tracker',
        short_name: 'Gym',
        description: 'Log your sets, track progress, hit PRs.',
        theme_color: '#0a0a12',
        background_color: '#0a0a12',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // clientsClaim without skipWaiting: the new worker still only
        // activates on the explicit SKIP_WAITING postMessage (main.jsx's tap
        // handler, #125) — clientsClaim just makes that activate claim the
        // tab that triggered it, so `navigator.serviceWorker.controller`
        // actually changes and a `controllerchange` event fires at all (see
        // main.jsx's own explicit listener, which is what reloads — see that
        // comment for why vite-plugin-pwa's own built-in reload trigger can't
        // be relied on here). Without clientsClaim, an uncontrolled tab (any
        // first-ever visit, i.e. the common case) has nothing to transition
        // on tap: the worker still activates in the background, but no event
        // ever tells the page it's safe to reload. Traced empirically in
        // Task 4 verification. (clientsClaim also means one tap claims every
        // open tab/instance for this origin, not just the one that tapped —
        // main.jsx's `onNeedReload() {}` is what stops that from reloading
        // any of the others.)
        clientsClaim: true,
        // Purges old-build api-reads-* caches on activate — see #142 and
        // public/api-cache-cleanup.js for why this needs importScripts
        // rather than a runtimeCaching option.
        importScripts: ['api-cache-cleanup.js'],
        // SPA: serve the app shell for client-side routes when offline / on refresh
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/],
        // default globs + woff2 so the self-hosted fonts are precached
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Exercise-demo frames (CC0) — cache-first so demos work on flaky
            // gym wifi. NOTE: the URLs pin the mutable @main ref, so a cached
            // frame can lag upstream changes by up to the TTL (acceptable; a
            // 404 on a fresh fetch falls back to the YouTube link).
            urlPattern: ({ url }) => url.hostname === 'cdn.jsdelivr.net',
            handler: 'CacheFirst',
            options: {
              cacheName: 'demo-frames',
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 180 },
              // 200 only: caching opaque (status 0) responses CacheFirst would
              // pin a captive portal's intercept page as the "demo" for 180 days.
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Offline-read: last-seen history/progress still render without a connection.
            // Only GETs are cached; writes (POST/PATCH/DELETE) always need the Pi reachable.
            // /api/export is excluded: it's a data-safety/export endpoint that must never
            // be served stale from the service-worker cache.
            urlPattern: ({ url, request }) =>
              url.pathname.startsWith('/api/') &&
              !url.pathname.startsWith('/api/export') &&
              request.method === 'GET',
            handler: 'NetworkFirst',
            options: {
              // Commit-scoped so a new deploy can never serve a response an
              // older build cached — see #142 and frontend/apiCacheName.js.
              cacheName: apiReadsCacheName(appCommit),
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
              // #145: NetworkFirst's cache fallback is invisible to the page —
              // its fetch() still resolves 200 res.ok whether the response
              // came from a live network hit or a failed one. This plugin is
              // the only place that actually sees the underlying fetch
              // reject (or, below, take as long as the timeout race above),
              // so it tells every open tab via postMessage;
              // frontend/src/lib/networkStatus.js + main.jsx turn that into
              // the badge networkStatus.test.js and VersionBadge.test.jsx
              // cover. fetchDidSucceed must return its response unchanged —
              // Workbox uses the return value as what actually gets served.
              //
              // Each hook below is serialized to standalone source
              // independently (vite-plugin-pwa/workbox-build embeds a
              // function's own .toString(), not the module scope it was
              // written in — confirmed by inspecting the built dist/sw.js),
              // so a plain JS closure shared between them would silently not
              // exist at runtime. Cross-call state (pending request start
              // times, a sequence counter) lives on `self` instead, which is
              // the one thing genuinely shared across all of them in the
              // actual running service worker.
              //
              // Why track start times at all: the `networkTimeoutSeconds: 4`
              // race above can resolve with a *stale cache* response even
              // when the real fetch eventually succeeds — fetchDidSucceed
              // still fires, not fetchDidFail, so a naive fail/succeed-only
              // signal misses exactly the "slow, not dead" case most likely
              // on real gym wifi (a hard failure is comparatively rare). A
              // fetch that took as long as the timeout already means the
              // page got the stale response for that pageview regardless of
              // this fetch's own eventual outcome, so it's treated the same
              // as a failure. 4000 must match `networkTimeoutSeconds: 4`
              // above — this duplication is why, not an accident.
              //
              // `seq` guards against a second failure mode: concurrent
              // requests settle independently, so an older, slower one can
              // report after a newer one already succeeded. Without an
              // ordering signal that stale failure would stick the badge on
              // forever — networkStatus.js's handleMessage drops any message
              // whose seq is behind the newest one it's already applied.
              // Keyed by URL, not the Request object: Workbox clones the
              // request between hooks (see StrategyHandler.js's fetch()), so
              // object identity doesn't survive from requestWillFetch to
              // fetchDidFail/fetchDidSucceed — the URL does.
              plugins: [
                {
                  requestWillFetch: async ({ request }) => {
                    self.__wtApiPending = self.__wtApiPending || new Map()
                    self.__wtApiSeq = (self.__wtApiSeq || 0) + 1
                    self.__wtApiPending.set(request.url, { seq: self.__wtApiSeq, start: Date.now() })
                    return request
                  },
                  fetchDidFail: async ({ originalRequest }) => {
                    const pending = self.__wtApiPending || new Map()
                    const meta = pending.get(originalRequest.url)
                    pending.delete(originalRequest.url)
                    const clients = await self.clients.matchAll({ type: 'window' })
                    clients.forEach((c) => c.postMessage({ type: 'API_NETWORK_UNREACHABLE', seq: meta?.seq }))
                  },
                  fetchDidSucceed: async ({ request, response }) => {
                    const pending = self.__wtApiPending || new Map()
                    const meta = pending.get(request.url)
                    pending.delete(request.url)
                    const tookTooLong = meta != null && (Date.now() - meta.start) >= 4000
                    const clients = await self.clients.matchAll({ type: 'window' })
                    clients.forEach((c) => c.postMessage({
                      type: tookTooLong ? 'API_NETWORK_UNREACHABLE' : 'API_NETWORK_RECOVERED',
                      seq: meta?.seq,
                    }))
                    return response
                  },
                },
              ],
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      // Trailing slash matters: '/api' (no slash) is a plain string-prefix
      // match, so it also intercepts unrelated same-prefix module URLs like
      // '/apiCacheName.js' (see #124, which added a top-level import of it
      // from src/lib/session.jsx) and proxies them at the backend, which
      // doesn't even run in dev/e2e -- breaking every page's initial render,
      // not just the api-cache-name module. `api.js`'s `base + path` always
      // yields '/api/...', so this stays exact for every real call.
      '/api/': 'http://localhost:8000',
    },
  },
  test: {
    environment: 'jsdom', globals: true, setupFiles: './src/test-setup.js',
    // frontend/e2e is the Playwright suite (playwright.config.js), a
    // separate test runner with an incompatible test()/expect() — Vitest's
    // default *.spec.js discovery would otherwise try to execute it too.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
