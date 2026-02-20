/**
 * STEPA — Facility ID verification (safety check before STEP0).
 *
 * Reads the facility ID from the 6800 detail page header and compares
 * it against the expected facility ID from the job record.
 * Throws FacilityMismatchError if they don't match.
 *
 * Reference: docs/requirements.md §3.2, docs/design.md §3.5
 */

import type { Page } from "playwright";
import type { Job } from "../job-state.js";
import { getFacilityLincolnId } from "../facility-lookup.js";
import { verifyFacilityId } from "../verify-facility.js";

export async function run(
  _jobId: string,
  page: Page,
  job: Job,
): Promise<void> {
  console.log("[STEPA] Facility ID verification (pre-STEP0)");

  const expectedId = await getFacilityLincolnId(job.facility_id);
  console.log(`[STEPA] Expected lincoln_id: ${expectedId}`);

  await verifyFacilityId(page, expectedId, "STEPA");
}
