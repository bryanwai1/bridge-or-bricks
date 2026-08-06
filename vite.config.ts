import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // bind to every interface, so phones on the LAN and the Codespaces
    // port-forwarder can both reach the dev server
    host: true,
    port: 5173,
    // Codespaces serves the app from <name>-5173.app.github.dev, which Vite
    // would otherwise reject as an unknown host
    allowedHosts: true,
  },
})
