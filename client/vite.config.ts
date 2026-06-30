import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@config': path.resolve(__dirname, '../gameConfig'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    host: true,            // bind all interfaces (IPv4 + IPv6) so localhost/127.0.0.1 both work
    port: 5173,
    fs: { allow: [path.resolve(__dirname, '..')] },
    proxy: { '/api': 'http://127.0.0.1:4000' },
  },
});
