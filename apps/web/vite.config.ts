import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/',
  plugins: [react(), tailwindcss()],
  build: { outDir: '../../workspace/public', emptyOutDir: true, assetsDir: 'assets' },
  server: { host: '127.0.0.1', proxy: { '/api': 'http://127.0.0.1:4317' } },
});
