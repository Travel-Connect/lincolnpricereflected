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
import { TOP_PAGE_URL } from "../constants.js";

const MAX_SWITCH_ATTEMPTS = 5;

/**
 * Try to read the facility ID from the current page.
 * Returns the ID string or null if the element isn't found.
 */
async function readFacilityId(
  page: Page,
  selector: string,
): Promise<string | null> {
  const visible = await page
    .locator(selector)
    .first()
    .isVisible()
    .catch(() => false);
  if (!visible) return null;
  const text = await page
    .locator(selector)
    .first()
    .textContent({ timeout: 3000 })
    .catch(() => null);
  return text?.trim() ?? null;
}

/**
 * Log current page state for debugging.
 */
async function logPageState(page: Page, context: string): Promise<void> {
  const title = await page.title().catch(() => "???");
  const url = page.url();
  console.log(`[STEPA] ${context} — title: "${title}", url: ${url}`);
}

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
  await page.waitForTimeout(1000);

  await logPageState(page, "After navigation");

  // Verify we're actually on the top page (not redirected to login)
  const pageTitle = await page.title();
  if (pageTitle.includes("ログイン") || pageTitle.includes("認証")) {
    throw new Error(
      `[STEPA] Session expired — redirected to login page. Please re-run the job.`,
    );
  }

  // Read current facility ID
  const facilityIdSelector = getSelector("stepA.facilityIdText");
  const currentId = await readFacilityId(page, facilityIdSelector);

  if (!currentId) {
    const html = await page.content().catch(() => "");
    const snippet = html.substring(0, 500);
    throw new Error(
      `[STEPA] Facility ID element "${facilityIdSelector}" not found on page "${pageTitle}". ` +
      `URL: ${page.url()}. Page snippet: ${snippet}`,
    );
  }

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

    // Ensure we're on a page with the search input
    // If not on the top page, navigate there first
    const hasInput = await page
      .locator(searchInputSelector)
      .first()
      .isVisible()
      .catch(() => false);

    if (!hasInput) {
      console.log("[STEPA] Search input not found — navigating to top page");
      await page.goto(TOP_PAGE_URL, { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(1000);
      await logPageState(page, "After re-navigation");
    }

    // Wait for the search input to be ready
    const input = page.locator(searchInputSelector);
    try {
      await input.waitFor({ state: "visible", timeout: 10000 });
    } catch {
      await logPageState(page, "Search input not visible");
      console.log("[STEPA] Search input still not visible — will retry");
      continue;
    }
    await page.waitForTimeout(500); // Let jQuery autocomplete initialize

    // Clear and type facility name to trigger jQuery UI autocomplete
    // Must use pressSequentially (not fill) to fire keyup events
    await input.click({ clickCount: 3 }); // select all existing text
    await input.press("Backspace");

    // Use shorter search term — just the first few chars trigger autocomplete
    const searchTerm = facilityName.substring(0, 4);
    console.log(`[STEPA] Typing search term: "${searchTerm}"`);
    await input.pressSequentially(searchTerm, { delay: 100 });

    // Wait for autocomplete dropdown to appear
    try {
      await page.waitForSelector(autocompleteItemSelector, {
        state: "visible",
        timeout: 8000,
      });
    } catch {
      const inputVal = await input.inputValue().catch(() => "???");
      console.log(`[STEPA] Autocomplete didn't appear. Input value: "${inputVal}"`);
      // Try clicking the input and retyping with full name
      await input.click();
      await input.selectText();
      await input.pressSequentially(facilityName, { delay: 80 });
      try {
        await page.waitForSelector(autocompleteItemSelector, {
          state: "visible",
          timeout: 8000,
        });
      } catch {
        console.log("[STEPA] Autocomplete still not appearing — will retry");
        continue;
      }
    }

    // Find and click the matching autocomplete item
    const acItems = page.locator(autocompleteItemSelector);
    const itemCount = await acItems.count();
    console.log(`[STEPA] Found ${itemCount} autocomplete items`);

    let clicked = false;
    for (let i = 0; i < itemCount; i++) {
      const text = (await acItems.nth(i).textContent()) ?? "";
      console.log(`[STEPA]   Item ${i}: "${text}"`);
      // Use relaxed matching (normalize full-width/half-width spaces)
      const normalizedText = text.replace(/\u3000/g, " ").trim();
      const normalizedName = facilityName.replace(/\u3000/g, " ").trim();
      if (normalizedText.includes(normalizedName) || normalizedName.includes(normalizedText)) {
        await acItems.nth(i).click();
        clicked = true;
        console.log(`[STEPA] Clicked item: "${text}"`);
        break;
      }
    }

    if (!clicked && itemCount > 0) {
      // Click the first item as fallback
      const firstText = (await acItems.first().textContent()) ?? "";
      console.log(`[STEPA] No exact match — clicking first item: "${firstText}"`);
      await acItems.first().click();
    }

    // Wait for navigation/page load after autocomplete selection
    // The click triggers form submission to Ascsc1010SwitchAction.do
    try {
      await page.waitForLoadState("networkidle", { timeout: 15000 });
    } catch {
      console.log("[STEPA] Network didn't settle after 15s — proceeding");
    }
    await page.waitForTimeout(1000);

    // Log page state after switch attempt
    await logPageState(page, "After switch");

    // Check for ANY known error codes (not just MASC1042)
    const pageContent = await page.content();
    const errorMatch = pageContent.match(/(?:MASC|MSFW|MSFE)\d{4}/);
    if (errorMatch) {
      const errorCode = errorMatch[0];
      console.log(`[STEPA] Error detected: ${errorCode}`);

      if (errorCode === "MASC1042") {
        console.log("[STEPA] Double login error — re-selecting for forced switch");
        // Stay on this page and re-select immediately
        continue;
      }

      // For other errors, log and navigate back
      console.log(`[STEPA] Unexpected error ${errorCode} — navigating back to retry`);
      await page.goto(TOP_PAGE_URL, { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(1000);
      continue;
    }

    // Check if we're now on the correct facility
    // The switch action might have rendered the top page directly (no redirect)
    const newId = await readFacilityId(page, facilityIdSelector);

    if (newId) {
      console.log(`[STEPA] After switch: facility = ${newId}`);
      if (newId === expectedId) {
        console.log("[STEPA] Facility switch successful");
        return;
      }
      console.log(`[STEPA] Wrong facility — expected ${expectedId}, got ${newId}`);
    } else {
      console.log("[STEPA] Facility ID not found on current page");
      // Check if we need to navigate back to top page to see the result
      const currentUrl = page.url();
      if (currentUrl.includes("SwitchAction")) {
        console.log("[STEPA] On switch action page — navigating to top page to check result");
        await page.goto(TOP_PAGE_URL, { waitUntil: "networkidle", timeout: 15000 });
        await page.waitForTimeout(1000);
        await logPageState(page, "After redirect to top");

        const idAfterRedirect = await readFacilityId(page, facilityIdSelector);
        if (idAfterRedirect) {
          console.log(`[STEPA] Facility after redirect: ${idAfterRedirect}`);
          if (idAfterRedirect === expectedId) {
            console.log("[STEPA] Facility switch successful (after redirect)");
            return;
          }
        }
      }
    }

    // Navigate back to top page for next attempt
    console.log("[STEPA] Switch didn't succeed — retrying...");
    await page.goto(TOP_PAGE_URL, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(1000);
  }

  // Final verification
  const finalId = await readFacilityId(page, facilityIdSelector);
  if (finalId !== expectedId) {
    throw new Error(
      `Facility switch failed after ${MAX_SWITCH_ATTEMPTS} attempts: expected "${expectedId}", got "${finalId ?? "null"}"`,
    );
  }
}
