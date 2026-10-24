import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: '*.demo.ts',
  timeout: 120_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5181/', viewport: { width: 1600, height: 900 } },
  projects: [{ name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1600, height: 900 } } }],
  webServer: { command: 'npx vite --port 5181 --strictPort', url: 'http://localhost:5181', reuseExistingServer: true, cwd: '../..' },
})
