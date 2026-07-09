import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'

// Docker builds have no .git (see .dockerignore) — the commit comes in as the
// APP_COMMIT build arg there; local dev/test falls back to git, then "dev".
const appCommit = process.env.APP_COMMIT
  || (() => { try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return 'dev' } })()

export default defineConfig({
  define: { __APP_COMMIT__: JSON.stringify(appCommit) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
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
              cacheName: 'api-reads',
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
      '/api': 'http://localhost:8000',
    },
  },
  test: { environment: 'jsdom', globals: true, setupFiles: './src/test-setup.js' },
})
