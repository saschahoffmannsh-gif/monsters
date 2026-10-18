import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages: VITE_BASE=/monsters/ (npm run build:pages); lokal relativ
  base: process.env.VITE_BASE || './',
  server: { host: '0.0.0.0', port: 5173 },
  preview: { host: '0.0.0.0', port: 5173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
