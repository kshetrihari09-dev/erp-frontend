/**
 * offline/registerServiceWorker.ts
 *
 * The one line that actually activates everything vite.config.ts's
 * VitePWA block precaches — without calling this, the service worker is
 * built but never installed, and the app would NOT survive a network
 * loss the way requirement #1 needs. Called once from main.tsx.
 *
 * `registerSW` comes from vite-plugin-pwa's virtual module — generated at
 * build time, not a real file (see vite-env.d.ts's client type
 * reference).
 */
import { registerSW } from 'virtual:pwa-register'

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return  // very old browser — app still works online, just without offline support

  registerSW({
    immediate: true,
    onRegisteredSW(swUrl) {
      if (import.meta.env.DEV) console.debug('[PWA] service worker registered:', swUrl)
    },
    onRegisterError(error) {
      // Never block the app on this — online billing keeps working
      // exactly as it did before this file existed even if the service
      // worker itself fails to register for some reason.
      console.error('[PWA] service worker registration failed:', error)
    },
  })
}
