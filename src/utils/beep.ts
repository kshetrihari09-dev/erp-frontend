/**
 * beep.ts
 *
 * Tiny WebAudio beep generator for barcode scan feedback. No audio files,
 * no network fetch — everything is synthesized on the fly, so it works
 * fully offline (matching the rest of this app's offline/LAN scanner
 * story — see scannerRoutes.js / useLocalScanner.ts).
 *
 * A single AudioContext is created lazily on first use and reused —
 * browsers require it to be created/resumed from a real user gesture,
 * which the barcode input's own keydown handling already provides.
 */

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!ctx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    return ctx
  } catch {
    return null
  }
}

function tone(freq: number, startMs: number, durationMs: number, gainPeak: number, type: OscillatorType = 'sine') {
  const audio = getCtx()
  if (!audio) return
  const osc  = audio.createOscillator()
  const gain = audio.createGain()
  osc.type = type
  osc.frequency.value = freq
  osc.connect(gain)
  gain.connect(audio.destination)

  const t0 = audio.currentTime + startMs / 1000
  const t1 = t0 + durationMs / 1000
  gain.gain.setValueAtTime(0, t0)
  gain.gain.linearRampToValueAtTime(gainPeak, t0 + 0.008)
  gain.gain.linearRampToValueAtTime(0, t1)

  osc.start(t0)
  osc.stop(t1 + 0.01)
}

/** Short, bright, single beep — a product resolved and was added. */
export function playSuccessBeep() {
  tone(1760, 0, 90, 0.18, 'sine')
}

/** Lower double-buzz — barcode not found / scan failed. Distinct enough
 *  from the success tone to tell apart without looking at the screen. */
export function playErrorBeep() {
  tone(330, 0,   110, 0.20, 'square')
  tone(330, 140, 110, 0.20, 'square')
}
