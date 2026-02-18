/**
 * 2FA handler — waits for user to complete two-factor authentication.
 *
 * Strategy: Poll for URL change (2FA page → dashboard/other page).
 * The user manually enters the code in the headful browser.
 */

import type { Page } from "playwright";
import { TwoFactorTimeoutError } from "../errors.js";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Wait for user to complete 2FA in the browser.
 * Detects completion by URL change from the 2FA page.
 *
 * @param page - Playwright page on the 2FA screen
 * @param timeoutMs - Max wait time (default: 5 minutes)
 */
export async function waitFor2FA(
  page: Page,
  timeoutMs?: number,
): Promise<void> {
  const timeout =
    timeoutMs ??
    (parseInt(process.env.TWO_FACTOR_TIMEOUT_MS || "", 10) || DEFAULT_TIMEOUT_MS);

  const twoFactorUrl = page.url();
  const start = Date.now();

  console.log("[auth] 2FA detected — waiting for user input in browser...");
  console.log(
    `[auth] Timeout: ${Math.round(timeout / 1000)}s`,
  );

  while (Date.now() - start < timeout) {
    await page.waitForTimeout(2000);
    const currentUrl = page.url();

    if (currentUrl !== twoFactorUrl) {
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      console.log(`[auth] 2FA completed — navigated to: ${currentUrl}`);
      return;
    }

    const elapsed = Math.round((Date.now() - start) / 1000);
    if (elapsed % 30 === 0 && elapsed > 0) {
      console.log(`[auth] Still waiting for 2FA... (${elapsed}s)`);
    }
  }

  throw new TwoFactorTimeoutError(timeout);
}
