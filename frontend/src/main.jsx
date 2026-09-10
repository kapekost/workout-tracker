import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'
import './index.css'
import { shouldCheckForUpdate, updateStore } from './lib/swUpdate'

// An installed PWA resumed from the background never does a fresh navigation,
// so the browser's own update check does not fire and a deploy stays invisible
// until the app is force-quit and reopened. Ask explicitly instead: once when
// the app becomes visible (the moment a stale build is most likely and least
// disruptive to replace), and on a slow timer for a session left open.
//
// registerType is 'prompt', so a found update waits rather than reloading on
// its own — updateStore.markReady() below flags it and VersionBadge (#125)
// shows a tap-to-reload prompt, gated the same way shouldCheckForUpdate
// already gates whether the check itself runs.
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000

const updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateStore.markReady()
  },
  // vite-plugin-pwa's own internal reload-on-controllerchange (see the
  // comment on updateStore.setAction below for why we don't rely on it) is
  // NOT scoped to the tab that tapped — with clientsClaim (vite.config.js),
  // one tap claims every open tab/instance for this origin, and every tab
  // that had already seen the waiting update independently registers this
  // same internal listener. Left as the library's default, a sibling tab
  // (e.g. a second device, or a desktop tab left open) could self-reload the
  // instant clientsClaim runs — including one sitting mid-workout, which is
  // exactly the data-loss case this whole feature exists to prevent. A no-op
  // here fully replaces that branch (see register.js's `if (onNeedReload)
  // onNeedReload(); else window.location.reload()`), leaving our own
  // tap-scoped listener below as the only thing that ever reloads anything.
  onNeedReload() {},
  onRegisteredSW(_swUrl, registration) {
    updateStore.setRegistration(registration)
    if (!registration) return
    const check = () => {
      if (shouldCheckForUpdate(window.location.pathname)) registration.update()
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
    setInterval(check, UPDATE_CHECK_INTERVAL_MS)
  },
})
// workbox-window's own auto-reload (which vite-plugin-pwa's updateServiceWorker
// return value relies on) only fires on a `controllerchange` whose `isUpdate`
// flag is true — and that flag is a one-time snapshot taken when the page
// first loads, of whether a service worker was *already* controlling it then.
// For the "resumed from background, never re-navigated" case described above,
// that snapshot is permanently false, so tapping the prompt would silently
// activate the new worker without ever reloading. Reload directly off the
// real `controllerchange` instead of trusting that snapshot.
updateStore.setAction(() => {
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true })
  updateServiceWorker()
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
