import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { visualizer } from 'rollup-plugin-visualizer';

// https://vite.dev/config/

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
    sourcemap: true,
    modulePreload: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('emoji-picker-react')) return 'emoji-picker';
            if (id.includes('html2canvas') || id.includes('canvg')) return 'canvas-vendor';
            if (id.includes('@sentry')) return 'sentry';
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