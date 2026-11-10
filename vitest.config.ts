import { defineConfig } from 'vitest/config'
import path from 'path'

// Component/unit specs (guards, permissions, navigation): `npm test`.
// Kept separate from vite.config.ts so tests do not need the production env/PWA plugins.
// Only *.spec.* files run here — the existing *.test.ts files are standalone scripts (`npx tsx <file>`) and are left alone.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.spec.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
})
