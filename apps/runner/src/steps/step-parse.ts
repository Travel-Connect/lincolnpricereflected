/**
 * PARSE step — Excel file parsing.
 * TODO: Implement Excel parsing via Python subprocess.
 */

import type { Page } from "playwright";
import type { Job } from "../job-state.js";

export async function run(
  _jobId: string,
  _page: Page,
  _job: Job,
): Promise<void> {
  console.log("[PARSE] TODO: Excel parsing not yet implemented");
}
