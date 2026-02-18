/**
 * STEPC — Output & verification.
 * TODO: Implement date range setting, plan group selection, output, and verification.
 */

import type { Page } from "playwright";
import type { Job } from "../job-state.js";

export async function run(
  _jobId: string,
  _page: Page,
  _job: Job,
): Promise<void> {
  console.log("[STEPC] TODO: Output & verification not yet implemented");
}
