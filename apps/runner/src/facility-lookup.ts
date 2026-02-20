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
  const info = await getFacilityInfo(facilityId);
  return info.lincoln_id;
}

/**
 * Look up a facility's lincoln_id and name by its UUID primary key.
 */
export async function getFacilityInfo(
  facilityId: string,
): Promise<{ lincoln_id: string; name: string }> {
  const { data, error } = await getSupabase()
    .from("facilities")
    .select("lincoln_id, name")
    .eq("id", facilityId)
    .single();

  if (error || !data) {
    throw new Error(
      `Facility not found: ${facilityId} (${error?.message ?? "no data"})`,
    );
  }

  return { lincoln_id: data.lincoln_id, name: data.name };
}
