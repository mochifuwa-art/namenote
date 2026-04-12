import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Capacitor requires relative paths (./); web deploys use /namenote/ or /namenote/staging/
  base: process.env.CAPACITOR_BUILD === 'true'
    ? './'
    : (process.env.VITE_BASE_PATH ?? '/namenote/'),
  define: {
    // Injected at build time — use as __APP_VERSION__ in source code
    __APP_VERSION__: JSON.stringify(version),
  },
})
