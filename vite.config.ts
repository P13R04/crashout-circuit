import { defineConfig } from 'vite';
import { resolve } from 'path';

// Multi-page app: table (root), pilot (/pilot), oz (/oz)
export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist/clients',
    rollupOptions: {
      input: {
        table:  resolve(__dirname, 'client-table/index.html'),
        pilot:  resolve(__dirname, 'client-pilot/index.html'),
        oz:     resolve(__dirname, 'client-oz/index.html'),
      },
    },
  },
  server: {
    port: 5173,
    // Proxy WebSocket and API calls to the game server during dev
    proxy: {
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
  resolve: {
    alias: {
      // Shared types can be imported from either client or server code
      '@shared': resolve(__dirname, 'server'),
    },
  },
});
