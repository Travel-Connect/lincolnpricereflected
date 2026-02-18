/**
 * STEPB — Bulk copy (calendars via autocomplete on 5050 page).
 *
 * Before performing any copy operations, this step re-verifies the
 * facility ID as a safety check (same logic as STEPA).
 *
 * Reference: docs/requirements.md §3.4, docs/design.md §3.7
 */

import type { Page } from "playwright";
import type { Job } from "../job-state.js";
import { verifyFacilityId } from "../verify-facility.js";

export async function run(
  _jobId: string,
  page: Page,
  _job: Job,
): Promise<void> {
  // --- Safety: verify facility ID before any data modification ---
  console.log("[STEPB] Pre-check: verifying facility ID before bulk copy");
  // TODO: Resolve expected facility ID from job record
  // const expectedId = await getFacilityLincolnId(job.facility_id);
  // await verifyFacilityId(page, expectedId, "STEPB");
  console.log("[STEPB] TODO: Facility ID pre-check + bulk copy not yet implemented");
}
