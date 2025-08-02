
import { copyFileSync, mkdirSync } from 'fs';
import react from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// Ensure public directory exists and copy monero.worker.js for dev
mkdirSync('public', { recursive: true });
[
  {
    src: 'node_modules/monero-ts/dist/monero.worker.js',
    dest: 'public/monero.worker.js',
  }
].forEach(({ src, dest }) => copyFileSync(src, dest));

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({ include: ["http", "https", "fs", "stream", "util", "path"] }),
    {
      name: "co≤≤≤py-files",
      writeBundle: () =>
        [
          {
            src: "node_modules/monero-ts/dist/monero.worker.js",
            dest: "dist/monero.worker.js",
          }
        ].forEach(({ src, dest }) => copyFileSync(src, dest)),
    },
  ],
  optimizeDeps: {
    include: ['monero-ts']
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    commonjsOptions: { transformMixedEsModules: true },
    rollupOptions: {
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        format: "es",
      },
    },
  },
  publicDir: "public",
});
