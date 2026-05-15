import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('node_modules/recharts')) return 'charts'
          if (id.includes('node_modules/flatpickr') || id.includes('node_modules/react-flatpickr')) return 'date'
          if (id.includes('node_modules/lucide-react')) return 'icons'
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router-dom/')
          ) return 'react-vendor'
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8933',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:8933',
        ws: true,
      }
    }
  }
})
