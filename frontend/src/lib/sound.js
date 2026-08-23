// Mobile browsers only allow an AudioContext to produce sound once it has been
// created/resumed synchronously inside a user-gesture handler (a tap). The
// rest-timer beep fires later from a setInterval callback, which is not a
// gesture, so a fresh AudioContext made there stays silently suspended.
// unlockAudio() must be called from an onClick (e.g. "Log Set", which is also
// what starts the rest period whose completion beep we need later) so the
// same context is already running by the time playBeep() is called.
let audioCtx = null

export function unlockAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    if (!audioCtx) audioCtx = new Ctx()
    if (audioCtx.state === 'suspended') audioCtx.resume()
  } catch { /* audio not available */ }
}

export function playBeep() {
  if (!audioCtx) return
  try {
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.frequency.value = 880; osc.connect(gain); gain.connect(audioCtx.destination)
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime)
    osc.start()
    osc.stop(audioCtx.currentTime + 0.25)
  } catch { /* audio not available */ }
}
