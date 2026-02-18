/**
 * PARSE step — Excel file parsing → expected ranks → DB save.
 *
 * 1. Parse the uploaded Excel file via Python subprocess
 * 2. Log parse results (dates, room types, warnings)
 * 3. Save expected ranks to job_expected_ranks table
 */

import type { Page } from "playwright";
import type { Job } from "../job-state.js";
import { parseExcel } from "../parsers/excel-reader.js";
import {
  saveExpectedRanks,
  deleteExpectedRanks,
} from "../parsers/save-expected-ranks.js";

export async function run(
  jobId: string,
  _page: Page,
  job: Job,
): Promise<void> {
  if (!job.excel_file_path) {
    throw new Error("[PARSE] No excel_file_path set on job");
  }

  console.log(`[PARSE] Parsing: ${job.excel_file_path}`);

  // 1. Parse Excel
  const result = await parseExcel(job.excel_file_path);

  console.log(
    `[PARSE] Facility candidate: ${result.facility_name_candidate ?? "(none)"}`,
  );
  console.log(
    `[PARSE] Dates: ${result.dates.length} (${result.dates[0]} → ${result.dates[result.dates.length - 1]})`,
  );
  console.log(`[PARSE] Room types: ${result.room_types.join(", ")}`);
  console.log(
    `[PARSE] Ranks: ${result.meta.filled_cells} filled, ${result.meta.empty_cells} empty`,
  );

  if (result.warnings.length > 0) {
    console.log(`[PARSE] Warnings (${result.warnings.length}):`);
    for (const w of result.warnings.slice(0, 10)) {
      console.log(`  - ${w}`);
    }
    if (result.warnings.length > 10) {
      console.log(`  ... and ${result.warnings.length - 10} more`);
    }
  }

  if (result.ranks.length === 0) {
    throw new Error("[PARSE] No rank data extracted from Excel");
  }

  // 2. Clear previous expected ranks (for re-parse)
  await deleteExpectedRanks(jobId);

  // 3. Save to DB
  const count = await saveExpectedRanks(jobId, result.ranks);
  console.log(`[PARSE] Saved ${count} expected ranks to DB`);
}
