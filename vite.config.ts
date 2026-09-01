import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const tailscaleServeHostname = 'leto.taile04360.ts.net'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    allowedHosts: [tailscaleServeHostname],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: false,
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    allowedHosts: [tailscaleServeHostname],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: false,
      },
    },
  },
})
