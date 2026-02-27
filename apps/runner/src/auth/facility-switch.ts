/**
 * Facility switch — changes the active facility in Lincoln.
 *
 * Mechanism: jQuery UI autocomplete on top page header.
 * 1. Click openButton to focus the autocomplete input
 * 2. Fill searchInput with facility name
 * 3. Click matching autocomplete item → triggers form submission
 * 4. If MASC1042 double-login error, repeat steps 1-3 (forced switch)
 */

import type { Page } from "playwright";
import { getSelector } from "../selectors.js";
import { FacilityMismatchError } from "../errors.js";
import { MAX_SWITCH_ATTEMPTS } from "../constants.js";

/**
 * Switch to a different facility.
 * @param page - Playwright page (must be logged in, on any Lincoln page)
 * @param facilityName - Facility name to search for in autocomplete
 * @param expectedFacilityId - Expected facility ID to verify after switch
 */
export async function switchFacility(
  page: Page,
  facilityName: string,
  expectedFacilityId?: string,
): Promise<void> {
  console.log(`[auth] Switching facility to: ${facilityName}`);

  const openBtnSelector = getSelector("facilitySwitch.openButton");
  const searchSelector = getSelector("facilitySwitch.searchInput");
  const selectItemSelector = getSelector("facilitySwitch.selectItem");

  for (let attempt = 1; attempt <= MAX_SWITCH_ATTEMPTS; attempt++) {
    // Open autocomplete
    const openBtn = page.locator(openBtnSelector);
    if (await openBtn.isVisible().catch(() => false)) {
      await openBtn.click();
      await page.waitForTimeout(500);
    }

    // Fill and trigger autocomplete
    const searchInput = page.locator(searchSelector);
    await searchInput.clear();
    await searchInput.fill(facilityName);
    await page.waitForTimeout(2000); // Wait for autocomplete suggestions

    // Click matching item (triggers form submit → Ascsc1010SwitchAction.do)
    const item = page.locator(selectItemSelector).filter({ hasText: facilityName }).first();
    if (await item.isVisible().catch(() => false)) {
      await Promise.all([
        page.waitForLoadState("load", { timeout: 15000 }).catch(() => {}),
        item.click(),
      ]);
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(2000);
    } else {
      // Try first available item if exact match not found
      const firstItem = page.locator(selectItemSelector).first();
      if (await firstItem.isVisible().catch(() => false)) {
        await Promise.all([
          page.waitForLoadState("load", { timeout: 15000 }).catch(() => {}),
          firstItem.click(),
        ]);
        await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(2000);
      } else {
        console.log(`[auth] No autocomplete suggestions found (attempt ${attempt})`);
        continue;
      }
    }

    // Verify facility switched
    const currentFacilityId = await page.evaluate(() => {
      return document.querySelector("dl.g_header_id dd")?.textContent?.trim() || "";
    });

    if (expectedFacilityId && currentFacilityId === expectedFacilityId) {
      console.log(`[auth] Facility switched successfully: ${facilityName} (${currentFacilityId})`);
      return;
    }

    if (!expectedFacilityId && attempt > 1) {
      // No ID to verify but we retried, assume success
      console.log(`[auth] Facility switch completed (attempt ${attempt})`);
      return;
    }

    // Check for double-login error
    const hasError = await page.evaluate(() => {
      const msg = document.querySelector(".c_txt-worning");
      return msg?.textContent?.includes("MASC1042") || false;
    });

    if (hasError) {
      console.log(`[auth] Double-login error detected, retrying (attempt ${attempt + 1})...`);
      continue;
    }

    // If no error but wrong facility, might need another attempt
    if (expectedFacilityId && currentFacilityId !== expectedFacilityId) {
      console.log(
        `[auth] Facility mismatch: expected ${expectedFacilityId}, got ${currentFacilityId} (attempt ${attempt})`,
      );
      continue;
    }

    console.log(`[auth] Facility switched to: ${facilityName}`);
    return;
  }

  // All attempts exhausted
  const finalId = await page.evaluate(() => {
    return document.querySelector("dl.g_header_id dd")?.textContent?.trim() || "";
  });

  if (expectedFacilityId && finalId !== expectedFacilityId) {
    throw new FacilityMismatchError(expectedFacilityId, finalId);
  }
}
