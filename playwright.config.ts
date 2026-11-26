import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build:e2e && npx vite preview --outDir dist-e2e --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: 'webkit-iphone-se', use: { ...devices['iPhone SE'], browserName: 'webkit' } },
    { name: 'webkit-iphone-13', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
  ],
});
