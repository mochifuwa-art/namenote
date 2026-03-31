import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Capacitor requires relative paths (./); web deploys use /namenote/ or /namenote/staging/
  base: process.env.CAPACITOR_BUILD === 'true'
    ? './'
    : (process.env.VITE_BASE_PATH ?? '/namenote/'),
})
