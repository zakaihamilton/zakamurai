import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/isolated-preview',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'npm run dev:isolated',
    url: 'http://localhost:3001/isolated-preview-test.html',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
