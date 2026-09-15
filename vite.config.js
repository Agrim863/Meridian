import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  server: {
    port: 5173,
    open: true,
    proxy: { '/api': 'http://127.0.0.1:5002' }
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
