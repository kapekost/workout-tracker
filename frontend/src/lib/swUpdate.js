// When it is safe to ask the service worker to check for a new build.
//
// The worker registers with registerType: 'autoUpdate', so the moment an update
// is found the page reloads. Everywhere in this app that is harmless — except
// mid-workout, where the weight and reps inputs hold values the user has typed
// but not yet logged. Reloading there loses them between sets.
//
// So the gate is on the CHECK, not on the reload: skip the check while a
// workout is open and the update lands on the next visit to any other screen.
// A missed check costs one deploy cycle; a bad reload costs logged work.
export function shouldCheckForUpdate(pathname) {
  if (typeof pathname !== 'string') return false
  return !pathname.startsWith('/workout/')
}
