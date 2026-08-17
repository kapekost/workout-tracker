import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'
import './index.css'
import { shouldCheckForUpdate } from './lib/swUpdate'

// An installed PWA resumed from the background never does a fresh navigation,
// so the browser's own update check does not fire and a deploy stays invisible
// until the app is force-quit and reopened. Ask explicitly instead: once when
// the app becomes visible (the moment a stale build is most likely and least
// disruptive to replace), and on a slow timer for a session left open.
//
// registerType is 'autoUpdate', so a found update reloads the page — which is
// why shouldCheckForUpdate refuses while a workout is in progress.
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000

registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
