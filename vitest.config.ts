import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    // E2E lives under tests/e2e and is run by Playwright, not vitest.
    exclude: ['tests/e2e/**', 'node_modules/**'],
    // Compile src/*.ts → src/*.js before any test (the harness evals the
    // compiled output), so even a direct `npx vitest` never tests stale JS.
    globalSetup: ['tests/helpers/global-setup.ts'],
  },
});
