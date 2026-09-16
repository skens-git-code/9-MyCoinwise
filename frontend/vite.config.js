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

export default defineConfig({
  plugins: [
    react(),
    visualizer({
      filename: 'dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  build: {
    chunkSizeWarningLimit: 2000, // This increases the limit to 2000kb
  },
})