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
