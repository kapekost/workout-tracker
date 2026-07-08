let queue = []
let timer = null

export function track(name, props) {
  queue.push({
    name,
    screen: typeof location !== 'undefined' ? location.pathname : null,
    props: props ?? null,
  })
  if (!timer) timer = setTimeout(() => flush(), 5000)
}

export function flush(useBeacon = false) {
  if (timer) { clearTimeout(timer); timer = null }
  if (queue.length === 0) return
  const batch = queue
  queue = []
  const body = JSON.stringify(batch)
  try {
    if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }))
    } else {
      fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {})
    }
  } catch {
    /* analytics is best-effort — never surface to the UI */
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true)
  })
  window.addEventListener('pagehide', () => flush(true))
}
