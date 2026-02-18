/**
 * Facility switch — changes the active facility in Lincoln.
 *
 * Note: searchInput, selectItem, confirmButton selectors are still TBD.
 * The openButton has been identified as `a.cFormTextBtn3Switch`.
 * Full implementation requires inspecting the facility switch dialog DOM.
 */

import type { Page } from "playwright";
import { getSelector } from "../selectors.js";

/**
 * Switch to a different facility.
 * @param page - Playwright page (must be logged in)
 * @param facilityName - Facility name to search for
 */
export async function switchFacility(
  page: Page,
  facilityName: string,
): Promise<void> {
  console.log(`[auth] Switching facility to: ${facilityName}`);

  // Open the facility switch dialog
  const openBtnSelector = getSelector("facilitySwitch.openButton");
  await page.locator(openBtnSelector).click();
  await page.waitForTimeout(1000);

  // Search and select — these will throw SelectorTBDError if still TBD
  const searchSelector = getSelector("facilitySwitch.searchInput");
  await page.locator(searchSelector).fill(facilityName);
  await page.waitForTimeout(500);

  const selectSelector = getSelector("facilitySwitch.selectItem");
  await page.locator(selectSelector).first().click();
  await page.waitForTimeout(500);

  const confirmSelector = getSelector("facilitySwitch.confirmButton");
  await page.locator(confirmSelector).click();

  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  console.log(`[auth] Facility switched to: ${facilityName}`);
}
