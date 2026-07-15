import { defineConfig, devices } from '@playwright/test';

/**
 * Deliberately does NOT auto-launch a webServer, unlike the main
 * e2e/playwright.config*.ts files. Those spin up LibreChat's own Node server
 * directly, which needs a real MongoDB and doesn't know how to run ERPray's
 * custom endpoint against a stub connector.
 *
 * This suite instead assumes the REAL erpray-chat Docker stack is already
 * running (the same image and librechat.yaml wiring production uses) with
 * `stub-connector.mjs` standing in for the connector — see this directory's
 * README for the exact commands. That is a deliberate trade: it tests the
 * actual built artifact these docs use in production, not a dev-mode
 * approximation of it.
 */
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  timeout: 60_000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.ERPRAY_E2E_BASE_URL || 'http://localhost:3080',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
