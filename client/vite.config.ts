import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite proxy sadece development'ta çalışır
// Production'da veya VITE_API_BASE_URL varsa doğrudan backend'e bağlanılır
const API_URL = process.env.VITE_API_BASE_URL || 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Dış IP'lerden erişilebilir yap
    port: 5173,
    proxy: {
      '/api': {
        target: API_URL,
        changeOrigin: true,
        // Dış IP erişimi için gerekli
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Proxying request:', req.method, req.url, 'to', API_URL);
          });
        },
      },
      '/uploads': {
        target: API_URL,
        changeOrigin: true,
      },
    },
  },
});


















