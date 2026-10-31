import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_UI_PORT } from '../src/server/constants.js';

const uiRoot = path.dirname(fileURLToPath(import.meta.url));
const apiServer = `http://127.0.0.1:${DEFAULT_UI_PORT}`;
const proxyToApiServer = { target: apiServer, changeOrigin: true };

export default defineConfig({
  plugins: [react()],
  base: './',
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(uiRoot, 'src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': proxyToApiServer,
      '/media': proxyToApiServer,
      '/session': proxyToApiServer,
    },
  },
});
