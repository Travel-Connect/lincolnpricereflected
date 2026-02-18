/**
 * Smoke test — verify Playwright can launch and close Chromium.
 */

import { describe, it, expect } from "vitest";
import { chromium } from "playwright";

describe("Playwright setup", () => {
  it("launches chromium in headless mode and closes cleanly", async () => {
    const browser = await chromium.launch({ headless: true });
    expect(browser.isConnected()).toBe(true);

    const page = await browser.newPage();
    await page.goto("about:blank");

    const title = await page.title();
    expect(typeof title).toBe("string");

    await browser.close();
  }, 30_000);
});
