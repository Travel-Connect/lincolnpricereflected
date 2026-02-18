/**
 * Shared facility ID verification logic.
 *
 * Used by STEPA (pre-STEP0 safety check) and STEPB (pre-bulk-copy safety check)
 * to ensure the correct facility is active before any data-modifying operation.
 *
 * Reference: docs/requirements.md §3.2, docs/design.md §3.5
 */

import type { Page } from "playwright";
import { getSelector } from "./selectors.js";
import { FacilityMismatchError } from "./errors.js";

/**
 * Verify that the facility ID shown on the current Lincoln page matches
 * the expected facility ID.
 *
 * @param page - Playwright Page instance
 * @param expectedFacilityId - The facility ID that should be active (e.g. "Y77131")
 * @param stepLabel - Label for logging (e.g. "STEPA", "STEPB")
 * @throws FacilityMismatchError if the facility ID does not match
 */
export async function verifyFacilityId(
  page: Page,
  expectedFacilityId: string,
  stepLabel: string,
): Promise<void> {
  const selector = getSelector("stepA.facilityIdText");
  const facilityIdElement = await page.locator(selector).first();
  const actualFacilityId = (await facilityIdElement.textContent())?.trim() ?? "";

  console.log(
    `[${stepLabel}] Facility ID check: expected="${expectedFacilityId}", actual="${actualFacilityId}"`,
  );

  if (actualFacilityId !== expectedFacilityId) {
    throw new FacilityMismatchError(expectedFacilityId, actualFacilityId);
  }

  console.log(`[${stepLabel}] Facility ID verified OK`);
}
