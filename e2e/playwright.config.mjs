// End-to-end UI tests: the web build in Chromium, against sample mods (see serve.mjs).
// Run: npx playwright test -c e2e/playwright.config.mjs
import { fileURLToPath } from 'url';
import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PORT || 5174);

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.e2e\.ts$/,
  // One app, one workspace: tests change mods, so they run one after another.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: 'node e2e/serve.mjs',
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { E2E_PORT: String(port) },
  },
});
