import { defineConfig } from 'vite';
import { join } from 'path';

export default defineConfig({
  root: join(process.cwd(), 'src', 'client'),
  publicDir: join(process.cwd(), 'public'),
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/images': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: join(process.cwd(), 'dist'),
    emptyOutDir: true,
  }
});
