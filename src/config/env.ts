/**
 * src/config/env.ts
 *
 * Centralized environment configuration.
 * All import.meta.env reads happen here — never in components or services.
 *
 * Vite replaces VITE_* values at build time, so the production bundle has
 * the correct values hardcoded with no runtime env lookup.
 */

// ── Raw env values ─────────────────────────────────────────────────────────────
const env = {
  API_BASE_URL:    import.meta.env.VITE_API_BASE_URL    as string,
  APP_NAME:        import.meta.env.VITE_APP_NAME        as string  || 'MediERP',
  APP_ENV:         import.meta.env.VITE_APP_ENV         as string  || 'development',
  SHOW_DEV_BADGE:  import.meta.env.VITE_SHOW_DEV_BADGE  === 'true',
  ENABLE_API_LOGS: import.meta.env.VITE_ENABLE_API_LOGS === 'true',
  FRONTEND_PORT:   import.meta.env.VITE_FRONTEND_PORT   as string  || '3000',
  BACKEND_PORT:    import.meta.env.VITE_BACKEND_PORT    as string  || '5000',
  IS_DEV:          import.meta.env.DEV   as boolean,
  IS_PROD:         import.meta.env.PROD  as boolean,
  MODE:            import.meta.env.MODE  as string,
}

// ── Validation — crash early if critical vars are missing ──────────────────────
if (!env.API_BASE_URL) {
  console.error(
    '[Config] VITE_API_BASE_URL is not set.\n' +
    'Create .env.development with:\n' +
    '  VITE_API_BASE_URL=http://localhost:5000/api/v1'
  )
}

// ── Derived values ─────────────────────────────────────────────────────────────
const backendBase = env.API_BASE_URL?.replace('/api/v1', '') || 'http://localhost:5000'
const isHttps     = env.API_BASE_URL?.startsWith('https') ?? false
const isLocal     = (env.API_BASE_URL || '').includes('localhost') ||
                    (env.API_BASE_URL || '').includes('127.0.0.1')

// ── Config object ──────────────────────────────────────────────────────────────
export const config = {
  // API
  apiBaseUrl:   env.API_BASE_URL || 'http://localhost:5000/api/v1',
  apiTimeout:   20_000,

  // App
  appName:      env.APP_NAME,
  appEnv:       env.APP_ENV,
  isDev:        env.IS_DEV,
  isProd:       env.IS_PROD,
  isStaging:    env.APP_ENV === 'staging',
  mode:         env.MODE,

  // Feature flags
  showDevBadge:  env.SHOW_DEV_BADGE && env.IS_DEV,
  enableApiLogs: env.ENABLE_API_LOGS,

  // Backend info
  backendUrl:    backendBase,
  isLocalBackend: isLocal,
  isHttps:       isHttps,

  // Ports — used by scanner QR URL builder
  frontendPort: env.FRONTEND_PORT,
  backendPort:  env.BACKEND_PORT,
} as const

export default config
