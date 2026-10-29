import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: { chunkSizeWarningLimit: 800 }, // three.js alone is ~500 kB
  worker: { format: 'es' },
  test: { environment: 'node' },
});
