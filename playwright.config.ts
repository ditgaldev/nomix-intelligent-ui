import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:5188', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'npm run dev:api', url: 'http://127.0.0.1:5189/api/health', reuseExistingServer: !process.env.CI, timeout: 30_000 },
    { command: 'npm run dev:playground', url: 'http://127.0.0.1:5188', reuseExistingServer: !process.env.CI, timeout: 30_000 },
  ],
});
