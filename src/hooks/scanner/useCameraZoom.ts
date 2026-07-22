/**
 * useCameraZoom.ts
 *
 * A modern, camera-app-style zoom engine for the local barcode scanner's
 * preview. This is a presentation-layer addition that sits *on top of*
 * useLocalScanner.ts — it never touches barcode/OCR decode logic, product
 * matching, or API calls. All it produces is: (a) a smoothly-animated CSS
 * scale to hand to the <video> element, and (b) calls into
 * useLocalScanner's existing `setZoom()` for the digital portion, which
 * already feeds the barcode-decode loop's per-frame crop unchanged.
 *
 * Hybrid hardware + digital zoom, same mental model as a phone camera:
 *   - If the active MediaStreamTrack reports a `zoom` capability
 *     (MediaStreamTrack.getCapabilities().zoom), zoom levels up to that
 *     capability's max are driven by
 *     `track.applyConstraints({ advanced: [{ zoom }] })` — the sensor/ISP
 *     does the work, so the preview stays sharp with no upscaling.
 *   - Requesting more zoom than the hardware supports layers a CSS scale
 *     on top of the (already hardware-zoomed) video frame, exactly like
 *     optical+digital hybrid zoom on a phone.
 *   - If the track reports no `zoom` capability at all, everything is
 *     pure CSS scale — identical in spirit to the previous
 *     implementation, just smoother and with a wider continuous range.
 *
 * The total zoom the user sees/controls is always a single continuous
 * number (0.01 increments) from `min` to `max`; this hook figures out how
 * much of that is hardware vs. digital on every change.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMotionValue, useSpring } from 'framer-motion'
import type { TouchEvent as ReactTouchEvent, WheelEvent as ReactWheelEvent, MouseEvent as ReactMouseEvent } from 'react'

export const ZOOM_PRESETS = [1, 2, 4] as const

const DEFAULT_MIN = 1
const DEFAULT_DIGITAL_CEILING = 5 // total zoom available when no hardware zoom capability exists
const INDICATOR_HOLD_MS = 900
const DOUBLE_TAP_MS = 320
const WHEEL_SENSITIVITY = 0.0022
const BUTTON_STEP = 0.25

interface HwRange { min: number; max: number; step: number }

interface Options {
  /** Returns the currently-live camera track, or null/undefined if none. */
  getTrack: () => MediaStreamTrack | null | undefined
  /** Called with the digital (CSS) scale portion — wire straight to useLocalScanner's setZoom. */
  onDigitalZoom: (scale: number) => void
  /** Whether the scanner view is currently open — zoom resets to 1x on open, same as before. */
  active: boolean
  min?: number
  digitalCeiling?: number
}

export default function useCameraZoom({ getTrack, onDigitalZoom, active, min = DEFAULT_MIN, digitalCeiling = DEFAULT_DIGITAL_CEILING }: Options) {
  const [hwRange, setHwRange] = useState<HwRange | null>(null)
  const [max, setMax] = useState(digitalCeiling)
  const [totalZoom, setTotalZoom] = useState(min)
  const [showIndicator, setShowIndicator] = useState(false)

  const hwRangeRef      = useRef<HwRange | null>(null)
  const lastHwSentRef    = useRef<number | null>(null)
  const indicatorTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTapRef       = useRef(0)
  const pinchStartDist   = useRef<number | null>(null)
  const pinchStartZoom   = useRef(min)

  // The animated CSS scale handed to the <video> — a spring so every
  // change (buttons, presets, pinch, wheel) glides rather than snaps.
  const scaleTarget = useMotionValue(1)
  const scaleSpring = useSpring(scaleTarget, { stiffness: 300, damping: 30, mass: 0.4 })

  // ── Re-probe hardware zoom capability (call after camera (re)start / switch) ──
  const refresh = useCallback(() => {
    const track = getTrack()
    if (!track) {
      hwRangeRef.current = null
      setHwRange(null)
      setMax(digitalCeiling)
      return
    }
    try {
      const caps: any = track.getCapabilities?.()
      if (caps?.zoom && typeof caps.zoom.max === 'number' && caps.zoom.max > caps.zoom.min) {
        const range: HwRange = { min: caps.zoom.min ?? min, max: caps.zoom.max, step: caps.zoom.step || 0.01 }
        hwRangeRef.current = range
        setHwRange(range)
        setMax(Math.max(range.max, digitalCeiling))
      } else {
        hwRangeRef.current = null
        setHwRange(null)
        setMax(digitalCeiling)
      }
    } catch {
      hwRangeRef.current = null
      setHwRange(null)
      setMax(digitalCeiling)
    }
    lastHwSentRef.current = null
  }, [getTrack, min, digitalCeiling])

  const applyHardwareZoom = useCallback((value: number) => {
    const track = getTrack()
    const range = hwRangeRef.current
    if (!track || !range) return
    const clamped = Math.min(range.max, Math.max(range.min, value))
    if (lastHwSentRef.current !== null && Math.abs(lastHwSentRef.current - clamped) < 0.01) return
    lastHwSentRef.current = clamped
    // Fire-and-forget: applyConstraints is async, but the CSS spring
    // already gives instant visual feedback, so we never block on it.
    ;(track as any).applyConstraints?.({ advanced: [{ zoom: clamped }] })?.catch?.(() => {})
  }, [getTrack])

  const bumpIndicator = useCallback(() => {
    setShowIndicator(true)
    if (indicatorTimer.current) clearTimeout(indicatorTimer.current)
    indicatorTimer.current = setTimeout(() => setShowIndicator(false), INDICATOR_HOLD_MS)
  }, [])

  // Splits a requested total zoom into a hardware target + a digital (CSS)
  // remainder, applies both, and updates the displayed number.
  const commit = useCallback((requested: number) => {
    const clamped = Math.min(max, Math.max(min, requested))
    const range = hwRangeRef.current
    const hwMax = range?.max ?? min

    let digital: number
    if (range && clamped <= hwMax) {
      applyHardwareZoom(clamped)
      digital = 1
    } else {
      if (range) applyHardwareZoom(hwMax)
      digital = range ? clamped / hwMax : clamped
    }

    scaleTarget.set(digital)
    onDigitalZoom(digital)
    setTotalZoom(Math.round(clamped * 100) / 100)
    bumpIndicator()
  }, [max, min, applyHardwareZoom, onDigitalZoom, bumpIndicator, scaleTarget])

  const setZoom = useCallback((value: number) => commit(value), [commit])
  const zoomIn  = useCallback(() => commit(totalZoom + BUTTON_STEP), [commit, totalZoom])
  const zoomOut = useCallback(() => commit(totalZoom - BUTTON_STEP), [commit, totalZoom])

  const cyclePreset = useCallback(() => {
    const presets = ZOOM_PRESETS.filter(p => p <= max)
    if (presets.length === 0) { commit(min); return }
    const currentIdx = presets.findIndex(p => Math.abs(p - totalZoom) < 0.15)
    const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % presets.length
    commit(presets[nextIdx])
  }, [commit, max, min, totalZoom])

  // Reset to 1x whenever the scanner (re)opens — matches prior behavior.
  useEffect(() => {
    if (!active) return
    scaleTarget.set(1)
    setTotalZoom(min)
    lastHwSentRef.current = null
  }, [active, min, scaleTarget])

  useEffect(() => () => { if (indicatorTimer.current) clearTimeout(indicatorTimer.current) }, [])

  // ── Gesture bindings ────────────────────────────────────────────────────
  const touchDistance = (touches: ReactTouchEvent['touches']) => {
    const [a, b] = [touches[0], touches[1]]
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
  }

  const onTouchStart = useCallback((e: ReactTouchEvent) => {
    if (e.touches.length === 2) {
      pinchStartDist.current = touchDistance(e.touches)
      pinchStartZoom.current = totalZoom
    } else if (e.touches.length === 1) {
      const now = Date.now()
      if (now - lastTapRef.current < DOUBLE_TAP_MS) {
        cyclePreset()
        lastTapRef.current = 0
      } else {
        lastTapRef.current = now
      }
    }
  }, [totalZoom, cyclePreset])

  const onTouchMove = useCallback((e: ReactTouchEvent) => {
    if (e.touches.length === 2 && pinchStartDist.current) {
      e.preventDefault()
      const ratio = touchDistance(e.touches) / pinchStartDist.current
      commit(pinchStartZoom.current * ratio)
    }
  }, [commit])

  const onTouchEnd = useCallback((e: ReactTouchEvent) => {
    if (e.touches.length < 2) pinchStartDist.current = null
  }, [])

  const onWheel = useCallback((e: ReactWheelEvent) => {
    e.preventDefault()
    commit(totalZoom - e.deltaY * WHEEL_SENSITIVITY)
  }, [commit, totalZoom])

  const onDoubleClick = useCallback((_e: ReactMouseEvent) => {
    cyclePreset()
  }, [cyclePreset])

  return {
    totalZoom, min, max,
    hwSupported: !!hwRange,
    scaleSpring,      // MotionValue<number> — bind to <motion.video style={{ scale: scaleSpring }} />
    showIndicator,
    setZoom, zoomIn, zoomOut, cyclePreset, refresh,
    bind: { onTouchStart, onTouchMove, onTouchEnd, onWheel, onDoubleClick },
  }
}
