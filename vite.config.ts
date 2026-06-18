import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
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
    plugins: [react()],

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
