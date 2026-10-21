import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2020',
    sourcemap: false,
    // The engine chunk (lazy-loaded via dynamic import in GameCanvas) is
    // dominated by three.js — WebGL renderer + bloom + PMREM are
    // irreducible for this game. 582 kB minified / ~151 kB gzip, precached
    // by the service worker. Accepted (AUDIT L7): the default 500 kB
    // warning would fire on every build for a deliberate size.
    chunkSizeWarningLimit: 600,
  },
  server: {
    host: true,
  },
})