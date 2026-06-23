/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL:    string
  readonly VITE_APP_NAME:        string
  readonly VITE_APP_ENV:         string
  readonly VITE_SHOW_DEV_BADGE:  string
  readonly VITE_ENABLE_API_LOGS: string
  readonly VITE_FRONTEND_PORT:   string
  readonly VITE_BACKEND_PORT:    string
  readonly DEV:                  boolean
  readonly PROD:                 boolean
  readonly MODE:                 string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
