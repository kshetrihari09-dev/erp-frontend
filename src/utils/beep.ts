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

/** A reminder just became due — a 3-ring alarm pattern, deliberately more
 *  insistent/longer than the scan beeps above (higher-low-higher, like a
 *  simple alarm clock chime) so it reads as "something needs your
 *  attention" rather than "an action you just took succeeded/failed".
 *  Same synthesized-audio approach as the rest of this file — no audio
 *  file to fetch, works offline.
 *
 *  Browser autoplay policy note: like any AudioContext, this can only
 *  actually produce sound once the user has interacted with the page at
 *  least once this session (a click, a keypress, anywhere) — a browser-
 *  level restriction, not something callers can work around directly.
 *  unlockAudioOnFirstGesture() below closes that gap for the normal
 *  case; see its docblock for the one scenario it can't cover. */
export function playReminderAlarm() {
  tone(880, 0,    180, 0.22, 'sine')
  tone(660, 260,  180, 0.22, 'sine')
  tone(880, 520,  260, 0.24, 'sine')
}

let unlocked = false

/**
 * Call once, as early as possible (App.tsx — before login, even), to
 * eliminate the "first alarm might be silent" gap: the moment the user
 * makes ANY gesture anywhere in the app (a click, tap, or keypress — for
 * a billing app that's realistically the login click, seconds after the
 * page loads), this eagerly creates and resumes the shared AudioContext
 * right then, long before a reminder is ever due. By the time an actual
 * alarm needs to play, minutes or hours later, the context already
 * exists and is running — nothing left for the browser to block.
 *
 * Returns a cleanup function (remove the listeners once unlocked, or on
 * unmount) — call it from a useEffect.
 *
 * Remaining edge case this can't close: a session restored with zero
 * user interaction at all (e.g. the OS/browser relaunches a previously-
 * open tab on startup with an already-persisted login, and the person
 * genuinely never clicks or types anything before a reminder fires).
 * That's a browser-level restriction with no workaround — the alarm's
 * visual popup still appears either way, only the sound for that
 * specific alarm would be silent, and every alarm after the person's
 * first interaction plays normally.
 */
export function unlockAudioOnFirstGesture(): () => void {
  if (unlocked || typeof window === 'undefined') return () => {}
  const handler = () => {
    unlocked = true
    getCtx() // creates + resumes the shared context right now, on a real gesture
    window.removeEventListener('pointerdown', handler)
    window.removeEventListener('keydown', handler)
  }
  window.addEventListener('pointerdown', handler, { once: true, passive: true })
  window.addEventListener('keydown', handler, { once: true })
  return () => {
    window.removeEventListener('pointerdown', handler)
    window.removeEventListener('keydown', handler)
  }
}
