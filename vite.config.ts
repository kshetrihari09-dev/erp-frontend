import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

export default defineConfig(({ mode }) => {
  // Load env vars for the current mode (development / staging / production)
  const env = loadEnv(mode, process.cwd(), '')

  // Backend URL — read from env, fall back to localhost:5000
  const backendUrl = env.VITE_API_BASE_URL?.replace('/api/v1', '') || 'http://localhost:5000'

  // ── HTTPS in dev (optional — needed for camera on Android Chrome over LAN) ──
  // Generate certs with mkcert:
  //   mkcert -install
  //   mkcert -key-file certs/localhost-key.pem -cert-file certs/localhost.pem \
  //          localhost 127.0.0.1 192.168.1.x
  // Then set VITE_HTTPS=true in .env.local
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
      console.log('[Vite] HTTPS enabled with mkcert certs')
    } catch {
      console.warn('[Vite] HTTPS=true but cert files not found. Run mkcert first.')
      console.warn(`[Vite] Expected: ${keyPath}, ${certPath}`)
    }
  }

  return {
    plugins: [react()],

    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },

    // ── Dev server ──────────────────────────────────────────────────────────
    server: {
      port: parseInt(env.VITE_FRONTEND_PORT || '3000', 10),

      // Bind to all interfaces — phones on the same WiFi can reach the SPA
      host: '0.0.0.0',

      // Optional HTTPS (see above)
      ...(httpsConfig ? { https: httpsConfig } : {}),

      proxy: {
        // In development, proxy /api/* to the Express backend.
        // Eliminates CORS on desktop. Mobile phones bypass the proxy and
        // call the backend directly via LAN IP.
        '/api': {
          target:       backendUrl,
          changeOrigin: true,
          secure:       false,
          configure: (proxy) => {
            proxy.on('error', (err) => console.log('[proxy error]', err.message))
          },
        },
        // Proxy uploads directory too
        '/uploads': {
          target:       backendUrl,
          changeOrigin: true,
          secure:       false,
        },
      },
    },

    // ── Production build ────────────────────────────────────────────────────
    build: {
      outDir:       'dist',
      sourcemap:    mode === 'development',
      minify:       'esbuild',
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor:  ['react', 'react-dom', 'react-router-dom'],
            query:   ['@tanstack/react-query'],
            charts:  ['recharts'],
            motion:  ['framer-motion'],
            ui:      ['@radix-ui/react-dialog', '@radix-ui/react-select', '@radix-ui/react-toast'],
          },
        },
      },
    },

    // ── Define global constants ─────────────────────────────────────────────
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
      __BUILD_TIME__:  JSON.stringify(new Date().toISOString()),
    },
  }
})
