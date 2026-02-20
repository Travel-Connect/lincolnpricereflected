/**
 * Facility lookup: UUID → lincoln_id.
 *
 * Used by STEPA and STEPB to resolve the expected facility ID
 * before calling verifyFacilityId().
 */

import { getSupabase } from "./supabase-client.js";

/**
 * Look up a facility's lincoln_id by its UUID primary key.
 *
 * @param facilityId - UUID from job.facility_id
 * @returns lincoln_id string (e.g. "Y77131")
 * @throws Error if the facility does not exist or the query fails
 */
export async function getFacilityLincolnId(
  facilityId: string,
): Promise<string> {
  const { data, error } = await getSupabase()
    .from("facilities")
    .select("lincoln_id")
    .eq("id", facilityId)
    .single();

  if (error || !data) {
    throw new Error(
      `Facility not found: ${facilityId} (${error?.message ?? "no data"})`,
    );
  }

  return data.lincoln_id;
}
