/**
 * STEPA — Facility switch + ID verification (safety check before STEP0).
 *
 * 1. Navigates to top page
 * 2. Reads current facility ID
 * 3. If mismatch, performs facility switch via autocomplete
 * 4. Verifies the switch succeeded
 *
 * Facility switch mechanism:
 * - jQuery UI autocomplete on input.cFormTextInputSwitch
 * - Selecting an item triggers form submission to Ascsc1010SwitchAction.do
 * - First attempt often fails with MASC1042 (double login error)
 * - Must retry (select again) for forced switch — this is the expected flow
 *
 * Reference: docs/requirements.md §3.2, docs/design.md §3.5
 */

import type { Page } from "playwright";
import type { Job } from "../job-state.js";
import { getFacilityInfo } from "../facility-lookup.js";
import { getSelector } from "../selectors.js";

const TOP_PAGE_URL =
  "https://www.tl-lincoln.net/accomodation/Ascsc1010InitAction.do";
const MAX_SWITCH_ATTEMPTS = 3;

export async function run(
  _jobId: string,
  page: Page,
  job: Job,
): Promise<void> {
  console.log("[STEPA] Facility switch + ID verification");

  const { lincoln_id: expectedId, name: facilityName } =
    await getFacilityInfo(job.facility_id);
  console.log(`[STEPA] Target: ${facilityName} (${expectedId})`);

  // Navigate to top page
  await page.goto(TOP_PAGE_URL, { waitUntil: "networkidle", timeout: 15000 });

  // Read current facility ID
  const facilityIdSelector = getSelector("stepA.facilityIdText");
  const currentId = (
    (await page.locator(facilityIdSelector).first().textContent()) ?? ""
  ).trim();
  console.log(`[STEPA] Current facility: ${currentId}`);

  if (currentId === expectedId) {
    console.log("[STEPA] Already on correct facility — no switch needed");
    return;
  }

  // Need to switch
  console.log(`[STEPA] Switching from ${currentId} → ${expectedId}`);
  await switchFacility(page, facilityName, expectedId);
}

/**
 * Perform facility switch via the jQuery UI autocomplete widget.
 * First attempt often triggers MASC1042 (double login); retry forces switch.
 */
async function switchFacility(
  page: Page,
  facilityName: string,
  expectedId: string,
): Promise<void> {
  const searchInputSelector = getSelector("facilitySwitch.searchInput");
  const autocompleteItemSelector = getSelector("facilitySwitch.selectItem");
  const facilityIdSelector = getSelector("stepA.facilityIdText");

  for (let attempt = 1; attempt <= MAX_SWITCH_ATTEMPTS; attempt++) {
    console.log(`[STEPA] Switch attempt ${attempt}/${MAX_SWITCH_ATTEMPTS}`);

    // Clear and type facility name to trigger jQuery UI autocomplete
    // Must use pressSequentially (not fill) to fire keyup events
    const input = page.locator(searchInputSelector);
    await input.click({ clickCount: 3 }); // select all existing text
    await input.press("Backspace");
    await input.pressSequentially(facilityName, { delay: 50 });

    // Wait for autocomplete dropdown to appear
    await page.waitForSelector(autocompleteItemSelector, {
      state: "visible",
      timeout: 5000,
    });

    // Click the first matching autocomplete item
    // This triggers form submission to Ascsc1010SwitchAction.do
    await page.locator(autocompleteItemSelector).first().click();

    // Wait for page load after form submission
    await page.waitForLoadState("networkidle", { timeout: 15000 });

    // Check if we landed on the right facility
    const newId = (
      (await page.locator(facilityIdSelector).first().textContent()) ?? ""
    ).trim();
    console.log(`[STEPA] After switch: facility = ${newId}`);

    if (newId === expectedId) {
      console.log("[STEPA] Facility switch successful");
      return;
    }

    // MASC1042 double-login error is expected on first attempt.
    // On the error page, the autocomplete is still available.
    // Re-selecting the same facility forces the switch (no navigation needed).
    const pageContent = await page.content();
    if (pageContent.includes("MASC1042")) {
      console.log("[STEPA] Got MASC1042 (double login) — re-selecting for forced switch");
      // DON'T navigate away — stay on this page and re-select immediately
      continue;
    }

    // Unexpected state — navigate back and retry
    console.log(`[STEPA] Switch didn't land on expected facility (got ${newId}), retrying...`);
    await page.goto(TOP_PAGE_URL, { waitUntil: "networkidle", timeout: 15000 });
  }

  // Final verification
  const finalId = (
    (await page.locator(facilityIdSelector).first().textContent()) ?? ""
  ).trim();
  if (finalId !== expectedId) {
    throw new Error(
      `Facility switch failed after ${MAX_SWITCH_ATTEMPTS} attempts: expected "${expectedId}", got "${finalId}"`,
    );
  }
}
