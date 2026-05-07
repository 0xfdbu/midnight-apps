import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import wasm from 'vite-plugin-wasm';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import fs from 'fs';
import path from 'path';

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
    {
      name: 'artifact-404',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith('/contracts/')) {
            const filePath = path.join(server.config.root, 'public', req.url);
            if (!fs.existsSync(filePath)) {
              res.statusCode = 404;
              res.end('Not found');
              return;
            }
          }
          next();
        });
      },
    },
  ],
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