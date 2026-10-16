import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests-e2e',
  globalSetup: './tests-e2e/global-setup.ts',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: process.env.BASE_URL ?? 'http://localhost:5181/', viewport: { width: 1600, height: 900 }, acceptDownloads: true },
  projects: [{ name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1600, height: 900 } } }],
  webServer: process.env.BASE_URL ? undefined : { command: 'npx vite --port 5181 --strictPort', url: 'http://localhost:5181', reuseExistingServer: true },
})
