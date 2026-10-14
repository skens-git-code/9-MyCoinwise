import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

import { visualizer } from 'rollup-plugin-visualizer';

// https://vite.dev/config/

export default defineConfig(({ mode }) => {
  const isProd = mode === 'production';
  const env = loadEnv(mode, process.cwd(), '');
  const apiProxyTarget = env.VITE_API_URL || 'http://localhost:5001';
  return {
    plugins: [
      react(),
      !isProd && visualizer({
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
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      target: 'es2020',
      cssCodeSplit: true,
      sourcemap: !isProd,
      chunkSizeWarningLimit: 1000,
      assetsInlineLimit: 4096,
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
              if (id.includes('exceljs') || id.includes('jspdf') || id.includes('jspdf-autotable')) return 'export-vendor';
              if (id.includes('lodash.debounce') || id.includes('lodash.throttle')) return 'lodash-vendor';
              if (id.includes('react-router-dom')) return 'router-vendor';
              if (id.includes('react') || id.includes('react-dom')) {
                return 'react-vendor';
              }
              return 'vendor';
            }
          },
        },
      },
    },
  };
})
