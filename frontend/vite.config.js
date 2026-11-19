import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

import { visualizer } from 'rollup-plugin-visualizer';

// https://vite.dev/config/

export default defineConfig(({ mode }) => {
  const isProd = mode === 'production';
  const env = loadEnv(mode, process.cwd(), '');
  const rawTarget = env.VITE_API_URL || 'http://localhost:5001';
  const apiProxyTarget = rawTarget.replace(/\/api\/?$/, '').replace(/\/+$/, '') || 'http://localhost:5001';
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
      fs: {
        strict: false,
      },
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      target: 'esnext',
      cssCodeSplit: true,
      cssMinify: 'lightningcss',
      sourcemap: !isProd,
      minify: 'terser',
      terserOptions: {
        compress: {
          dead_code: true,
          drop_console: isProd,
          drop_debugger: isProd,
          passes: 2,
          pure_getters: true,
          unsafe_math: true,
        },
        mangle: {
          safari10: true,
        },
        format: {
          comments: false,
        },
      },
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
              if (id.includes('react-router-dom') || id.includes('react-router')) return 'router-vendor';
              if (id.includes('i18next') || id.includes('react-i18next')) return 'i18n-vendor';
              if (id.includes('date-fns')) return 'date-fns-vendor';
              if (id.includes('@tanstack/react-query') || id.includes('@tanstack/query')) return 'tanstack-query';
              if (id.includes('dompurify')) return 'dompurify';
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
