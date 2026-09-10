// When it is safe to ask the service worker to check for a new build, AND
// (since #125) when it is safe to show that an update is ready to apply.
//
// The worker registers with registerType: 'prompt', so a found update waits
// for an explicit tap rather than reloading on its own. Everywhere in this
// app that waiting state is fine to surface immediately — except mid-workout,
// where the weight and reps inputs hold values the user has typed but not yet
// logged, and a stray reload there would lose them between sets.
//
// So this same gate covers both call sites: main.jsx uses it to decide
// whether to run the CHECK at all, and VersionBadge (Task 3) uses it to
// decide whether to DISPLAY a ready update it already knows about. One
// function means the two can never disagree — if a "waiting" update lands
// while a freak race puts one behind the workout gate anyway, the badge just
// stays quiet until the pathname changes.
export function shouldCheckForUpdate(pathname) {
  if (typeof pathname !== 'string') return false
  return !pathname.startsWith('/workout/')
}

// The flag main.jsx sets when the service worker reports a waiting update
// (onNeedRefresh, Task 2) and the flag VersionBadge (Task 3) reads to decide
// whether to show the "tap to reload" prompt. A factory rather than a single
// exported singleton so tests get an isolated instance each time instead of
// needing a reset hook between cases; `updateStore` below is the one
// app-wide instance the real app wires up.
export function createUpdateStore() {
  let ready = false
  let action = null
  let registration = null
  const subscribers = new Set()

  function getSnapshot() {
    return ready
  }

  function subscribe(callback) {
    subscribers.add(callback)
    return () => subscribers.delete(callback)
  }

  function notify() {
    subscribers.forEach((callback) => callback())
  }

  function markReady() {
    ready = true
    notify()
  }

  function setAction(fn) {
    action = fn
  }

  function applyUpdate() {
    if (action) action()
  }

  function setRegistration(reg) {
    registration = reg
  }

  function checkNow() {
    if (registration) registration.update()
  }

  return { subscribe, getSnapshot, markReady, setAction, applyUpdate, setRegistration, checkNow }
}

export const updateStore = createUpdateStore()
