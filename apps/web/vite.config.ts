import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // Use IPv4 loopback to avoid occasional ::1 proxy connection refusals on Windows.
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
});
