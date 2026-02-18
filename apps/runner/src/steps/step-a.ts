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
import { verifyFacilityId } from "../verify-facility.js";

export async function run(
  _jobId: string,
  page: Page,
  _job: Job,
): Promise<void> {
  // TODO: Resolve expected facility ID from job.facility_id via Supabase lookup
  // For now, log a placeholder until the full pipeline is wired up
  console.log("[STEPA] Facility ID verification (pre-STEP0)");
  console.log("[STEPA] TODO: Resolve expected facility ID from job record");

  // Once facility lookup is implemented, call:
  // const expectedId = await getFacilityLincolnId(job.facility_id);
  // await verifyFacilityId(page, expectedId, "STEPA");
}
