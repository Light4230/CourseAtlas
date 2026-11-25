import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    watch: {
      ignored: [
        '**/server/**',
        '**/data/**',
        '**/uploads/**',
        '**/.secrets/**',
        '**/dist/**',
        '**/*.tmpdir',
        '**/*.tmpdir/**',
        '**/*.tmp',
        '**/.*.tmp',
        '**/.remote-files.tmp',
        '**/docs/**',
      ],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
});
