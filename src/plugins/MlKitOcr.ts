/**
 * MlKitOcr.ts
 *
 * TypeScript bridge to the native Android ML Kit Text Recognition v2
 * plugin — see android/app/src/main/java/com/byapar/app/MlKitOcrPlugin.kt.
 * Uses the current standalone ML Kit SDK (com.google.mlkit:text-
 * recognition), not the deprecated Firebase ML Vision APIs.
 *
 * Only ever called on the Android/Capacitor native platform — see
 * isMlKitPlatform() below, which useLocalScanner.ts checks before ever
 * touching this plugin. Calling any method here from a regular browser
 * (including "Use Another Device") or from iOS simply rejects, since no
 * native handler is registered there — callers must always be prepared to
 * fall back to Tesseract.js (see the try/catch around every call site).
 *
 * All recognition happens on-device inside the plugin; only a base64
 * image crop goes over the bridge, and only structured text/geometry
 * comes back — no network calls, no API keys, nothing leaves the phone.
 */
import { registerPlugin, Capacitor } from '@capacitor/core'

export interface MlKitBoundingBox {
  left: number
  top: number
  width: number
  height: number
}

export interface MlKitElement {
  text: string
  confidence: number   // 0..1 — see the plugin for how this is derived
  boundingBox: MlKitBoundingBox
}

export interface MlKitLine {
  text: string
  confidence: number   // 0..1 — mean of this line's element confidences
  boundingBox: MlKitBoundingBox
  elements: MlKitElement[]
}

export interface MlKitBlock {
  text: string
  boundingBox: MlKitBoundingBox
  lines: MlKitLine[]
}

export interface MlKitOcrResult {
  text: string
  blocks: MlKitBlock[]
  lines: MlKitLine[]
  elements: MlKitElement[]
  confidence: number    // 0..1 — mean of all element confidences
  imageWidth: number
  imageHeight: number
}

export interface MlKitOcrPlugin {
  /** Creates (or reuses) the on-device recognizer. Cheap to call more
   *  than once — only the first call actually allocates anything. */
  initialize(): Promise<void>
  isAvailable(): Promise<{ available: boolean }>
  /** `image` is a base64-encoded JPEG/PNG (no "data:" prefix needed —
   *  the plugin strips one if present). */
  recognizeText(options: { image: string }): Promise<MlKitOcrResult>
  /** Releases the recognizer. Call when OCR mode closes, not on every
   *  frame — see useLocalScanner.ts's stopCamera(). */
  release(): Promise<void>
}

const MlKitOcr = registerPlugin<MlKitOcrPlugin>('MlKitOcr')

// True only inside the packaged Android app. A regular mobile/desktop
// browser — including one opened via "Use Another Device" — always
// reports false here and stays on the existing Tesseract.js path.
export function isMlKitPlatform(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export default MlKitOcr
