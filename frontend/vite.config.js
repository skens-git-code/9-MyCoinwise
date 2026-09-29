import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { visualizer } from 'rollup-plugin-visualizer';

// https://vite.dev/config/
// ─────────────────────────────────────────────────────────────────────────────
// [ORIGINAL CONFIG PRESERVED]
// export default defineConfig({
//   plugins: [react()],
//   build: {
//     chunkSizeWarningLimit: 2000,
//   },
// })
// ─────────────────────────────────────────────────────────────────────────────

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    mode !== 'production' && visualizer({
      filename: 'dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
  ].filter(Boolean),
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('recharts')) return 'recharts';
            if (id.includes('framer-motion')) return 'framer-motion';
            if (id.includes('lucide-react')) return 'icons';
            if (id.includes('exceljs') || id.includes('jspdf')) return 'export-vendor';
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'react-vendor';
            }
            return 'vendor';
          }
        },
      },
    },
  },
}))