/**
 * Save parsed rank data to the job_expected_ranks table.
 */

import { getSupabase } from "../supabase-client.js";
import type { RankEntry } from "./excel-reader.js";

/** Batch size for inserts (Supabase has a row limit per request) */
const BATCH_SIZE = 500;

/**
 * Save rank entries to job_expected_ranks for a given job.
 * Inserts in batches to avoid payload size limits.
 *
 * @param jobId - The job UUID
 * @param ranks - Array of rank entries from the parser
 * @returns Number of rows inserted
 */
export async function saveExpectedRanks(
  jobId: string,
  ranks: RankEntry[],
): Promise<number> {
  if (ranks.length === 0) {
    console.log("[save-expected-ranks] No ranks to save");
    return 0;
  }

  const supabase = getSupabase();
  let totalInserted = 0;

  for (let i = 0; i < ranks.length; i += BATCH_SIZE) {
    const batch = ranks.slice(i, i + BATCH_SIZE);
    const rows = batch.map((r) => ({
      job_id: jobId,
      date: r.date,
      room_type: r.room_type,
      rank_code: r.rank_code,
    }));

    const { error, count } = await supabase
      .from("job_expected_ranks")
      .insert(rows);

    if (error) {
      throw new Error(
        `Failed to save expected ranks (batch ${Math.floor(i / BATCH_SIZE) + 1}): ${error.message}`,
      );
    }

    totalInserted += batch.length;
    console.log(
      `[save-expected-ranks] Saved batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} rows (total: ${totalInserted}/${ranks.length})`,
    );
  }

  return totalInserted;
}

/**
 * Delete existing expected ranks for a job (for re-parse).
 */
export async function deleteExpectedRanks(jobId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("job_expected_ranks")
    .delete()
    .eq("job_id", jobId);

  if (error) {
    throw new Error(
      `Failed to delete existing expected ranks: ${error.message}`,
    );
  }
}
