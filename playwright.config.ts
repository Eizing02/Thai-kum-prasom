import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: 1,
  timeout: 60000,
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], reducedMotion: 'reduce', launchOptions: { args: ['--enable-unsafe-swiftshader'] } } }],
  webServer: {
    command: 'npm run preview -- --host localhost --port 4173 --strictPort',
    url: 'http://localhost:4173', reuseExistingServer: !process.env.CI,
  },
})
