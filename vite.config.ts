import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

// Honour a PORT injected by the environment; fall back to Vite's default.
const port = Number.parseInt(process.env.PORT ?? '', 10);

export default defineConfig({
  server: Number.isFinite(port) && port > 0 ? { port, strictPort: true } : {},
  plugins: [
    dts({
      include: ['src'],
      outDir: 'dist',
      insertTypesEntry: true,
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      name: 'AssetLibrary',
      formats: ['es', 'umd'],
      fileName: (format) => (format === 'es' ? 'asset-library.js' : 'asset-library.umd.cjs'),
    },
    rollupOptions: {
      external: ['three'],
      output: {
        globals: { three: 'THREE' },
      },
    },
  },
});
