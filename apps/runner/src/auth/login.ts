/**
 * Lincoln login — fills credentials and clicks login button.
 * Handles force-login (duplicate session) automatically.
 */

import type { Page } from "playwright";
import { getSelector } from "../selectors.js";

export interface LoginResult {
  /** URL after login attempt */
  url: string;
  /** Page title after login */
  title: string;
  /** Whether 2FA screen was detected */
  needs2FA: boolean;
  /** Whether force-login was needed */
  wasForceLogin: boolean;
}

/**
 * Perform login on the Lincoln login page.
 * Prerequisites: page should be on the login URL.
 */
export async function login(
  page: Page,
  loginId: string,
  loginPw: string,
): Promise<LoginResult> {
  const loginUrl = getSelector("auth.loginUrl");
  let wasForceLogin = false;

  // Navigate to login page
  console.log("[auth] Navigating to login page");
  await page.goto(loginUrl, { waitUntil: "networkidle" });

  // Fill credentials
  const idSelector = getSelector("auth.loginIdInput");
  const pwSelector = getSelector("auth.loginPwInput");
  const btnSelector = getSelector("auth.loginButton");

  await page.locator(idSelector).waitFor({ state: "visible", timeout: 10000 });
  await page.locator(idSelector).fill(loginId);
  await page.locator(pwSelector).fill(loginPw);
  console.log("[auth] Credentials filled");

  // Click login
  await page.locator(btnSelector).click();
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  // Check for force-login (duplicate session)
  const forceLoginSelector = getSelector("auth.forceLoginButton");
  if (await page.locator(forceLoginSelector).isVisible().catch(() => false)) {
    console.log("[auth] Duplicate session detected — clicking force login");
    wasForceLogin = true;
    await page.locator(forceLoginSelector).click();
    await page.waitForLoadState("load", { timeout: 15000 }).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);
  }

  const url = page.url();
  const title = await page.title();

  // Check for login error (still on login page with error message)
  const hasError = await page.evaluate(() => {
    const err = document.querySelector(".c_txt-worning, .c_msg_error, .error");
    return err?.textContent?.trim() || null;
  });

  if (hasError && !wasForceLogin) {
    throw new Error(`[auth] Login failed: ${hasError}`);
  }

  // Detect 2FA
  const needs2FA =
    title.includes("2段階認証") || title.includes("認証コード");

  console.log(
    `[auth] Login result — URL: ${url}, title: ${title}, 2FA: ${needs2FA}, force: ${wasForceLogin}`,
  );

  return { url, title, needs2FA, wasForceLogin };
}
