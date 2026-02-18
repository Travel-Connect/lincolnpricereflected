/**
 * STEPB — Bulk copy (calendars via autocomplete).
 * TODO: Implement plan selection + copy + send.
 */

import type { Page } from "playwright";
import type { Job } from "../job-state.js";

export async function run(
  _jobId: string,
  _page: Page,
  _job: Job,
): Promise<void> {
  console.log("[STEPB] TODO: Bulk copy not yet implemented");
}
