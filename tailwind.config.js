/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        brand:  { DEFAULT: '#2563eb', light: '#eff6ff', dark: '#1d4ed8' },
        surface: 'var(--surface)',
        border:  'var(--border)',
      },
      boxShadow: {
        card: '0 1px 3px rgba(16,24,40,.06), 0 1px 2px rgba(16,24,40,.04)',
        modal:'0 20px 60px -10px rgba(16,24,40,.18)',
      },
    },
  },
  plugins: [],
}
