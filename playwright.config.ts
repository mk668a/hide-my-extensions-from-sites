import { defineConfig } from '@playwright/test';

// Extension testing needs a persistent context, so the spec launches the browser
// itself. We keep workers at 1 (one shared browser + extension) and no retries.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 30_000,
});
