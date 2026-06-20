// Tiny Web Audio helper — synthesizes beeps, no audio files needed.
let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

// Call on a user gesture so browsers allow audio later.
export function unlockAudio() { getCtx() }

function tone(freq: number, duration: number, type: OscillatorType = 'sine', gain = 0.18) {
  const c = getCtx()
  if (!c) return
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.value = freq
  osc.connect(g); g.connect(c.destination)
  const t = c.currentTime
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  osc.start(t); osc.stop(t + duration)
}

// Two-note alert when time drops to the 1-minute mark.
export function playLowTimeAlert() {
  tone(880, 0.16, 'sine', 0.2)
  setTimeout(() => tone(1175, 0.22, 'sine', 0.2), 190)
}

// Soft tick for the final seconds.
export function playTick() {
  tone(760, 0.07, 'square', 0.12)
}

// Final buzzer when time is up.
export function playTimeUp() {
  tone(440, 0.3, 'sawtooth', 0.2)
  setTimeout(() => tone(330, 0.4, 'sawtooth', 0.2), 280)
}
