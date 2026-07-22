/**
 * ZoomControl.tsx
 *
 * Presentation only — the floating circular zoom dial (+ / current level /
 * −) and the large transient "2.5×" bubble that flashes center-screen
 * whenever zoom changes, the way Google Camera / Google Lens do it.
 * All actual zoom math (hardware vs. digital, gestures, springs) lives in
 * useCameraZoom.ts; this component just renders its output.
 */

import { AnimatePresence, motion } from 'framer-motion'
import { Plus, Minus } from 'lucide-react'

interface Props {
  totalZoom:     number
  min:           number
  max:           number
  hwSupported:   boolean
  showIndicator: boolean
  onZoomIn:      () => void
  onZoomOut:     () => void
  onPreset:      () => void
  /** Hidden while the matches drawer is open, same as the old slider. */
  visible:       boolean
}

export default function ZoomControl({ totalZoom, min, max, hwSupported, showIndicator, onZoomIn, onZoomOut, onPreset, visible }: Props) {
  if (!visible) return null

  return (
    <>
      {/* Floating circular dial — right edge, vertically centered */}
      <motion.div
        initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
        className="absolute right-3 flex flex-col items-center gap-1 bg-black/40 backdrop-blur-md rounded-full px-1.5 py-2"
        style={{ top: '50%', transform: 'translateY(-50%)' }}
      >
        <button
          onClick={onZoomIn}
          disabled={totalZoom >= max - 0.01}
          aria-label="Zoom in"
          className="w-8 h-8 rounded-full flex items-center justify-center text-white active:scale-90 transition-transform disabled:opacity-30"
        >
          <Plus size={15} />
        </button>

        <motion.button
          onClick={onPreset}
          aria-label="Cycle zoom presets"
          whileTap={{ scale: 0.88 }}
          className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center text-white text-[11px] font-bold tabular-nums"
        >
          {totalZoom.toFixed(totalZoom < 10 ? 1 : 0)}×
        </motion.button>

        <button
          onClick={onZoomOut}
          disabled={totalZoom <= min + 0.01}
          aria-label="Zoom out"
          className="w-8 h-8 rounded-full flex items-center justify-center text-white active:scale-90 transition-transform disabled:opacity-30"
        >
          <Minus size={15} />
        </button>

        {hwSupported && (
          <span className="text-[7px] font-bold text-white/50 uppercase tracking-wide pt-0.5">HW</span>
        )}
      </motion.div>

      {/* Large transient center indicator */}
      <AnimatePresence>
        {showIndicator && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 26 }}
            className="absolute left-1/2 top-1/2 pointer-events-none"
            style={{ transform: 'translate(-50%, -50%)' }}
          >
            <div className="w-20 h-20 rounded-full bg-black/55 backdrop-blur-md border border-white/15 flex items-center justify-center">
              <span className="text-white font-bold text-lg tabular-nums">
                {totalZoom.toFixed(totalZoom < 10 ? 1 : 0)}×
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
