import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: 'list',
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'webkit-iphone-se',
      use: { ...devices['iPhone SE'], browserName: 'webkit' },
    },
    {
      name: 'webkit-iphone-13',
      use: { ...devices['iPhone 13'], browserName: 'webkit' },
    },
  ],
});
