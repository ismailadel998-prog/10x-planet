// Tiny Web Audio sound effects — no audio files needed
let ctx: AudioContext | null = null
let enabled = true

export function setSound(on: boolean) {
  enabled = on
}

function ac(): AudioContext | null {
  if (!enabled) return null
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.15, slideTo?: number) {
  const c = ac()
  if (!c) return
  const t = c.currentTime + start
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(c.destination)
  o.start(t)
  o.stop(t + dur + 0.05)
}

export const sfx = {
  click: () => tone(660, 0, 0.08, 'triangle', 0.08),
  lock: () => tone(440, 0, 0.12, 'square', 0.05, 520),
  correct: () => {
    tone(523, 0, 0.14, 'triangle')
    tone(659, 0.1, 0.14, 'triangle')
    tone(784, 0.2, 0.3, 'triangle')
  },
  wrong: () => {
    tone(260, 0, 0.18, 'sawtooth', 0.07, 180)
    tone(200, 0.15, 0.25, 'sawtooth', 0.06, 140)
  },
  tick: () => tone(1000, 0, 0.05, 'square', 0.03),
  warp: () => tone(200, 0, 0.5, 'sine', 0.1, 1200),
  shield: () => {
    tone(900, 0, 0.1, 'square', 0.06, 300)
    tone(1200, 0.08, 0.3, 'triangle', 0.1, 600)
  },
  victory: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.13, 0.25, 'triangle', 0.12)),
}
