import { defineConfig, devices } from '@playwright/test';

const idePort = Number(process.env.PLAYWRIGHT_IDE_PORT || 3000);
const previewPort = Number(process.env.PLAYWRIGHT_PREVIEW_PORT || 3001);
const baseURL = `http://localhost:${idePort}`;

/**
 * Playwright configuration for Zakamurai end-to-end tests.
 * To run smoke tests: npm run test:e2e
 * To run screenshot tests: npm run test:visual
 */
export default defineConfig({
  testDir: './tests/visual',
  timeout: 90_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  expect: {
    toHaveScreenshot: {
      // Linux font/antialiasing differs slightly across runners; keep tight
      // enough to catch real UI regressions while allowing CI baselines.
      maxDiffPixelRatio: 0.05,
    },
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    // Build/preview regression exercises the production two-origin boundary.
    command: `PLAYWRIGHT_IDE_PORT=${idePort} PLAYWRIGHT_PREVIEW_PORT=${previewPort} npm run dev:isolated`,
    url: `http://127.0.0.1:${idePort}`,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
    timeout: 120000,
  },
});
