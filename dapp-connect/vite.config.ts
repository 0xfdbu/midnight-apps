import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import tailwindcss from '@tailwindcss/vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    nodePolyfills({
      include: ['crypto', 'buffer', 'events', 'stream', 'util', 'process'],
      globals: {
        Buffer: true,
        process: true,
      },
    }),
    wasm(),
  ],
  server: {
    port: 5173,
  },
  optimizeDeps: {
    include: ['object-inspect'],
    exclude: [
      '@midnight-ntwrk/ledger-v8',
      '@midnight-ntwrk/onchain-runtime-v3',
      '@midnight-ntwrk/compact-runtime',
    ],
  },
  build: {
    target: 'esnext',
  },
});
