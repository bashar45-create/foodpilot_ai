import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(currentDir, 'src'),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Split heavy third-party libs into stable vendor chunks so the
        // browser can cache them and so route pages stay small.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          recharts: ['recharts'],
          icons: ['lucide-react'],
          dates: ['date-fns'],
          forms: ['react-hook-form', '@hookform/resolvers', 'zod'],
          query: ['@tanstack/react-query'],
          http: ['axios'],
        },
      },
    },
  },
});
