/**
 * The regression test for two findings that were previously proven only by a
 * one-off manual Playwright session, never committed anywhere:
 *
 *   1. The connector's artifact markdown must be a `:::artifact{...}`
 *      directive with the HTML nested in its own ```html fence INSIDE it —
 *      not a bare fence, and not a directive with the HTML dropped in bare.
 *      Both wrong forms shipped, each green in unit tests for weeks, because
 *      those tests only ever asserted the markdown STRING, never opened a
 *      browser. See erpray-app's packages/core/src/artifactDirective.ts.
 *   2. The artifact panel is a Sandpack iframe served from a CodeSandbox-
 *      hosted origin, not same-origin — `fetch()` from inside it back to the
 *      connector is blocked. The grid's `sandboxFallback` catch exists for
 *      exactly this and must actually be reachable.
 *
 * Run against the REAL erpray-chat Docker image (the same one production
 * runs), with stub-connector.mjs standing in for the connector, so this test
 * exercises the actual built frontend rather than a dev-mode approximation.
 * See this directory's README for the exact setup commands.
 */
import { test, expect } from '@playwright/test';

const EMAIL = `e2e-artifacts-${Date.now()}@erpray-internal-test.example`;
const PASSWORD = 'ArtifactsE2E!2026x';

test.beforeEach(async ({ page }) => {
  await page.goto('/register', { waitUntil: 'load' });
  await page.fill('input[name="name"]', 'E2E Artifacts');
  await page.fill('input[name="username"]', `e2eartifacts${Date.now()}`);
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.fill('input[name="confirm_password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1500);

  await page.goto('/login', { waitUntil: 'load' });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/c/new', { timeout: 15_000 }).catch(() => {});
});

async function ask(page: import('@playwright/test').Page, question: string) {
  const box = page.locator('textarea, #prompt-textarea, [contenteditable="true"]').first();
  await box.click();
  await box.fill(question);
  await page.keyboard.press('Enter');
}

test('chips render as real buttons, never as raw "**Next:**" text', async ({ page }) => {
  await ask(page, 'who are our top customers?');
  await page.waitForTimeout(8_000);

  // The raw markdown line must never be visible as literal text — that IS the
  // bug this component exists to prevent (FollowupChips.tsx strips it).
  await expect(page.locator('body')).not.toContainText('**Next:**');

  const chip = page.getByRole('button', { name: 'Only past-due' });
  await expect(chip).toBeVisible({ timeout: 10_000 });
});

test('clicking a chip submits it as the next message', async ({ page }) => {
  await ask(page, 'who are our top customers?');
  await page.getByRole('button', { name: 'Only past-due' }).click({ timeout: 10_000 });
  await page.waitForTimeout(4_000);

  // The refined answer text, proving the click actually submitted a new
  // message rather than just being a decorative, unwired button.
  await expect(page.locator('body')).toContainText('Filtered to past-due rows only');
});

test('the grid artifact opens a REAL Sandpack panel, not a syntax-highlighted code dump', async ({ page }) => {
  await ask(page, 'who are our top customers?');
  await page.waitForTimeout(10_000);

  // The exact failure mode this guards against: a bare/malformed directive
  // renders the HTML as visible CHAT text instead of opening a panel. Scoped
  // to the message thread specifically — the artifact panel's OWN "Code" tab
  // legitimately shows this same source, and asserting against the whole
  // page would flag that correct behavior as a false failure.
  const chatColumn = page.locator('main').first();
  await expect(chatColumn).not.toContainText('<!doctype html>');

  // The real Sandpack UI: a Code/Preview tab pair.
  await expect(page.getByText('Preview', { exact: false }).first()).toBeVisible({ timeout: 15_000 });
});

test('the artifact iframe blocks fetch() back to the connector — the sandbox is real, not assumed', async ({
  page,
}) => {
  await ask(page, 'who are our top customers?');
  await page.waitForTimeout(10_000);

  const frame = page.frameLocator('iframe').first();
  const button = frame.getByRole('button', { name: 'Test fetch() to connector' });
  await button.click({ timeout: 15_000 });

  const msg = frame.locator('#msg');
  await expect(msg).toContainText('FETCH BLOCKED', { timeout: 10_000 });
});

test('the hosted fallback link still works even though the sandbox blocks fetch', async ({ page, context }) => {
  await ask(page, 'who are our top customers?');
  await page.waitForTimeout(10_000);

  const link = page.getByRole('link', { name: /Open "Grid" in a new tab/ });
  await expect(link).toBeVisible({ timeout: 10_000 });

  const [popup] = await Promise.all([context.waitForEvent('page'), link.click()]);
  await popup.waitForLoadState();
  await expect(popup.locator('body')).toContainText('Sandbox fetch test');
});
