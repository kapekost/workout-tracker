import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
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
        runtimeCaching: [
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
