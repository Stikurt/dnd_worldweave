// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',               
  publicDir: 'public',     
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    port: 5173,
    proxy: {
      // Проксируем все запросы /api на бэкенд
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false
      },
      // Проксируем socket.io и WS на тот же бэкенд
      '/socket.io': {
        target: 'http://localhost:3000',  
        ws: true,
        changeOrigin: true,
        secure: false
      }
    }
  }
});
