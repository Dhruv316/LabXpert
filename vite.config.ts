import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import { pwaOptions } from './pwa.config';

export default defineConfig({
  // Relative, so the built app and its service worker work from any folder or sub-path.
  base: './',
  plugins: [react(), VitePWA(pwaOptions)],
  test: {
    environment: 'jsdom',
    testTimeout: 15000,
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup-pointer-event.ts'],
  },
});
