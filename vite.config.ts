import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import fs from 'fs'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  const backendUrl = env.VITE_API_BASE_URL?.replace('/api/v1', '') || 'http://localhost:5000'

  const useHttps = env.VITE_HTTPS === 'true'
  let httpsConfig: boolean | { key: Buffer; cert: Buffer } = false
  if (useHttps) {
    const keyPath  = env.VITE_SSL_KEY_PATH  || 'certs/localhost-key.pem'
    const certPath = env.VITE_SSL_CERT_PATH || 'certs/localhost.pem'
    try {
      httpsConfig = {
        key:  fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      }
    } catch {
      console.warn('[Vite] HTTPS=true but cert files not found.')
    }
  }

  return {
    plugins: [
      react(),
      // ── Offline-first PWA shell (see src/offline/ for the IndexedDB/sync
      // layer this pairs with) ──────────────────────────────────────────
      // This plugin's ONLY job is making the already-built app continue
      // to load with no network at all — precaching the JS/CSS/HTML/
      // fonts/icons/scanner libraries this build already produces, so a
      // tab that was opened online keeps working after the connection
      // drops, with no npm/dev-server/manual restart involved (that's
      // the whole point — see the project's offline-first requirements).
      // It has no involvement in billing data itself; that's IndexedDB
      // (src/offline/db.ts), not the service worker cache.
      VitePWA({
        // 'autoUpdate': a new deployment's service worker activates
        // automatically in the background (no user prompt, no forced
        // reload of an open tab mid-sale) and takes over on the tab's
        // *next* navigation/reload — never an unannounced hot-swap under
        // a cashier's feet during an active sale.
        registerType: 'autoUpdate',
        injectRegister: false, // registered explicitly in main.tsx for control over *when*
        manifest: {
          name:             'Byapar — Pharma + Accounting',
          short_name:       'Byapar',
          description:      'Offline-capable billing and accounting for pharmacies.',
          theme_color:      '#0f172a',
          background_color: '#0f172a',
          display:          'standalone',
          start_url:        '/',
          scope:            '/',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // Every static asset this build actually produces — JS, CSS,
          // the HTML shell, fonts, icons. The ZXing scanner bundle is
          // just another JS chunk from this same build, so it's covered
          // by '**/*.js' with no special-casing needed — see requirement
          // #12 (scanner must keep working offline once cached).
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,ttf,eot}'],
          // Precache is capped by default at ~2MB/file — this app's
          // largest chunks (pdf/report generation, barcode libs) can
          // exceed that, so raise the ceiling rather than silently
          // excluding them from the offline cache.
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
          // Client-side routing (React Router) — any navigation to a
          // path Workbox hasn't precached as its own file (e.g. deep-
          // linking straight to /sales while offline) still needs to
          // resolve to the cached index.html shell, exactly like a
          // normal SPA fallback.
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              // Read-only API calls (product/party/settings lookups) —
              // NetworkFirst so online users always see live data, but
              // falls back to the last successful response if the
              // network genuinely fails mid-request. This is a thin
              // extra safety net ON TOP OF the IndexedDB cache
              // (catalogSync.ts) — the actual offline billing data path
              // — not a replacement for it. Writes (POST/PUT/DELETE) are
              // deliberately NOT cached here: those go through the
              // explicit sync queue (src/offline/syncQueue.ts) instead,
              // where retries are idempotent by client_txn_id — silently
              // replaying a cached POST response would be exactly the
              // duplicate-transaction bug requirement #6 exists to
              // prevent.
              urlPattern: ({ url, request }) =>
                request.method === 'GET' && url.pathname.startsWith('/api/'),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'byapar-api-get-cache',
                networkTimeoutSeconds: 6,
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
        devOptions: {
          // Lets the offline behavior actually be tested in `npm run dev`
          // without needing a production build first.
          enabled: true,
          type: 'module',
        },
      }),
    ],

    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },

    server: {
      port: parseInt(env.VITE_FRONTEND_PORT || '3000', 10),
      host: '0.0.0.0',
      ...(httpsConfig ? { https: httpsConfig } : {}),
      proxy: {
        '/api': {
          target:       backendUrl,
          changeOrigin: true,
          secure:       false,
        },
        '/uploads': {
          target:       backendUrl,
          changeOrigin: true,
          secure:       false,
        },
      },
    },

     define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
      __BUILD_TIME__:  JSON.stringify(new Date().toISOString()),
    },
  }
})
