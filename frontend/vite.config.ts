import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import path from 'path';

// Files under public/ (e.g. try-seminai/index.html) are emitted to dist/ as static assets.
// In production, ensure the host serves those paths before SPA fallback rewrites to the root index.html.

export default defineConfig({
  plugins: [TanStackRouterVite(), react(), tailwindcss()],
  define: {
    global: 'globalThis',
  },
  build: {
    sourcemap: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 7177,
    proxy: {
      '/api': {
        target: 'http://localhost:8081',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
});
