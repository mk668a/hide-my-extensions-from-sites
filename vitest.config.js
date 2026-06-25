import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.js', 'tests/integration/**/*.test.js'],
    // E2E lives under tests/e2e and is run by Playwright, not vitest.
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
});
