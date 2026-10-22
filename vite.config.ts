import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // The map library is one ~1 MB chunk by itself; it's loaded only when a map is shown
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
