import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  // `--mode lan`: reachable from phones on the same network, over HTTPS (a self-signed
  // certificate), since video encoding and sharing only work on secure pages
  plugins: [react(), ...(mode === 'lan' ? [basicSsl()] : [])],
  build: {
    // The map library is one ~1 MB chunk by itself; it's loaded only when a map is shown
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
}));
