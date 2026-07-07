/**
 * CropOverlay.tsx
 *
 * Shown between "frame captured" and "OCR runs" in ProductScanModal (label
 * mode). Lets the user drag/resize a crop box over the frozen frame so OCR
 * only ever sees the label itself — not the shelf, hand, or other packaging
 * around it. Cropping tighter is one of the biggest single wins for OCR
 * accuracy, ahead of any pixel-level preprocessing.
 *
 * Coordinates: the crop box is tracked in "displayed image" pixels (i.e.
 * relative to the image's own top-left corner as rendered on screen, which
 * uses object-fit: contain and may be letterboxed within the container).
 * onConfirm converts back to the image's natural pixel coordinates, which
 * is what useProductCapture's confirmCrop expects.
 */

import { useRef, useState, useEffect, useCallback } from 'react'
import { Check, X as XIcon } from 'lucide-react'
import type { CropRect } from '@/hooks/scanner/useProductCapture'

interface Props {
  src:           string
  naturalWidth:  number
  naturalHeight: number
  suggestedRect: CropRect | null // auto-detected box, in natural pixel coords
  onConfirm:     (rect: CropRect) => void
  onCancel:      () => void
}

interface Box { x: number; y: number; w: number; h: number } // in displayed-image px
interface Layout { scale: number; dispW: number; dispH: number }

const MIN_BOX_PX = 44
type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se' | null

function clampBoxToDisplay(b: Box, dispW: number, dispH: number): Box {
  let { x, y, w, h } = b
  w = Math.max(MIN_BOX_PX, Math.min(w, dispW))
  h = Math.max(MIN_BOX_PX, Math.min(h, dispH))
  x = Math.max(0, Math.min(x, dispW - w))
  y = Math.max(0, Math.min(y, dispH - h))
  return { x, y, w, h }
}

export default function CropOverlay({ src, naturalWidth, naturalHeight, suggestedRect, onConfirm, onCancel }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [layout, setLayout] = useState<Layout | null>(null)
  const [box, setBox]       = useState<Box | null>(null)

  const dragRef = useRef<{ mode: DragMode; startX: number; startY: number; startBox: Box } | null>(null)

  // Compute how the image sits inside the container (object-fit: contain
  // math) and seed the initial crop box the first time layout is known —
  // from the auto-detected region if one was found, otherwise a centered
  // default matching the on-camera frame guide.
  const recomputeLayout = useCallback(() => {
    const el = containerRef.current
    if (!el || !naturalWidth || !naturalHeight) return
    const { clientWidth: cw, clientHeight: ch } = el
    const scale = Math.min(cw / naturalWidth, ch / naturalHeight)
    const dispW = naturalWidth  * scale
    const dispH = naturalHeight * scale
    setLayout({ scale, dispW, dispH })
    setBox(prev => {
      if (prev) return prev
      if (suggestedRect) {
        return clampBoxToDisplay({
          x: suggestedRect.x * scale, y: suggestedRect.y * scale,
          w: suggestedRect.width * scale, h: suggestedRect.height * scale,
        }, dispW, dispH)
      }
      return { x: dispW * 0.08, y: dispH * 0.22, w: dispW * 0.84, h: dispH * 0.56 }
    })
  }, [naturalWidth, naturalHeight, suggestedRect])

  useEffect(() => {
    recomputeLayout()
    window.addEventListener('resize', recomputeLayout)
    return () => window.removeEventListener('resize', recomputeLayout)
  }, [recomputeLayout])

  const clampBox = useCallback((b: Box, dispW: number, dispH: number): Box => clampBoxToDisplay(b, dispW, dispH), [])

  const handlePointerDown = useCallback((mode: DragMode) => (e: React.PointerEvent) => {
    if (!box) return
    e.stopPropagation()
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId)
    dragRef.current = { mode, startX: e.clientX, startY: e.clientY, startBox: box }
  }, [box])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag || !layout) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    const { dispW, dispH } = layout
    const s = drag.startBox
    let next: Box = s

    if (drag.mode === 'move') {
      next = { ...s, x: s.x + dx, y: s.y + dy }
    } else if (drag.mode === 'se') {
      next = { ...s, w: s.w + dx, h: s.h + dy }
    } else if (drag.mode === 'nw') {
      next = { x: s.x + dx, y: s.y + dy, w: s.w - dx, h: s.h - dy }
    } else if (drag.mode === 'ne') {
      next = { x: s.x, y: s.y + dy, w: s.w + dx, h: s.h - dy }
    } else if (drag.mode === 'sw') {
      next = { x: s.x + dx, y: s.y, w: s.w - dx, h: s.h + dy }
    }
    setBox(clampBox(next, dispW, dispH))
  }, [layout, clampBox])

  const handlePointerUp = useCallback(() => { dragRef.current = null }, [])

  const handleConfirm = useCallback(() => {
    if (!box || !layout) return
    onConfirm({
      x:      box.x / layout.scale,
      y:      box.y / layout.scale,
      width:  box.w / layout.scale,
      height: box.h / layout.scale,
    })
  }, [box, layout, onConfirm])

  const handleStyle = 'absolute w-6 h-6 -m-3 rounded-full bg-white border-2 border-purple-500 shadow touch-none'

  return (
    <div className="absolute inset-0 flex flex-col bg-black">
      <div ref={containerRef} className="relative flex-1 overflow-hidden select-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src} alt="Captured frame" draggable={false}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        />

        {layout && box && (
          <>
            {/* Dim everything outside the crop box */}
            <div className="absolute inset-0 pointer-events-none" style={{
              background: `linear-gradient(transparent, transparent)`,
              boxShadow: `0 0 0 9999px rgba(0,0,0,0.6)`,
              left: box.x, top: box.y, width: box.w, height: box.h,
            }} />

            {/* The crop box itself — drag anywhere inside to move */}
            <div
              onPointerDown={handlePointerDown('move')}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              className="absolute border-2 border-purple-400 touch-none"
              style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
            >
              {/* Rule-of-thirds guides */}
              <div className="absolute inset-0 pointer-events-none opacity-40">
                <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white" />
                <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white" />
                <div className="absolute top-1/3 left-0 right-0 h-px bg-white" />
                <div className="absolute top-2/3 left-0 right-0 h-px bg-white" />
              </div>

              {/* Corner resize handles */}
              <div onPointerDown={handlePointerDown('nw')} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}
                   className={`${handleStyle} top-0 left-0 cursor-nwse-resize`} />
              <div onPointerDown={handlePointerDown('ne')} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}
                   className={`${handleStyle} top-0 right-0 cursor-nesw-resize`} style={{ marginRight: -12, marginLeft: 0 }} />
              <div onPointerDown={handlePointerDown('sw')} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}
                   className={`${handleStyle} bottom-0 left-0 cursor-nesw-resize`} style={{ marginBottom: -12, marginTop: 0 }} />
              <div onPointerDown={handlePointerDown('se')} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}
                   className={`${handleStyle} bottom-0 right-0 cursor-nwse-resize`} style={{ marginBottom: -12, marginTop: 0, marginRight: -12, marginLeft: 0 }} />
            </div>
          </>
        )}

        <div className="absolute top-0 left-0 right-0 flex items-center justify-center p-3.5"
             style={{ paddingTop: 'max(14px, env(safe-area-inset-top, 0px))' }}>
          <div className="px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-md text-white text-xs font-semibold">
            {suggestedRect ? 'Adjust the detected crop if needed' : 'Drag corners to crop the label'}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 px-4 py-4"
           style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom, 0px))' }}>
        <button
          onClick={onCancel}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-white/12 text-white rounded-full font-semibold text-sm active:scale-95 transition-transform"
        >
          <XIcon size={16} /> Retake
        </button>
        <button
          onClick={handleConfirm}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-full font-semibold text-sm active:scale-95 transition-transform"
        >
          <Check size={16} /> Use This Crop
        </button>
      </div>
    </div>
  )
}
