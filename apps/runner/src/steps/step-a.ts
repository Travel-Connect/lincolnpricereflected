/**
 * STEPA — Facility ID verification.
 * TODO: Implement facility ID check on screen 6800.
 */

import type { Page } from "playwright";
import type { Job } from "../job-state.js";

export async function run(
  _jobId: string,
  _page: Page,
  _job: Job,
): Promise<void> {
  console.log("[STEPA] TODO: Facility ID verification not yet implemented");
}
