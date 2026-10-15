import { defineConfig } from '@playwright/test'
import { TERMINAL_URL } from './e2e/env'

// End-to-end: the production build of the terminal against a real, disposable Homebox 0.26.2.
// Run with `pnpm test:e2e` (builds first). Needs Docker and Chromium.
export default defineConfig({
  testDir: 'e2e',
  outputDir: '.cache/e2e/results',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  // One terminal, one Homebox: tests run one after another and seed their own data.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: TERMINAL_URL,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    viewport: { width: 1280, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath: process.env.E2E_CHROMIUM ?? '/usr/bin/chromium-browser',
      args: ['--no-sandbox'],
    },
  },
})
