import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' 使构建产物可直接以 file:// 协议被 Electron 加载
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
});
