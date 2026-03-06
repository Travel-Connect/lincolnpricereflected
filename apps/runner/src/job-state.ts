/**
 * Job state machine — tracks step progression and resume logic.
 * Reference: docs/requirements.md §4.2, docs/design.md §3.1
 */

import { getSupabase } from "./supabase-client.js";

/** Ordered list of execution steps */
export const STEPS = ["PARSE", "STEPA", "STEP0", "STEPB", "STEPC"] as const;
export type StepName = (typeof STEPS)[number];

export type JobStatus =
  | "PENDING"
  | "RUNNING"
  | "SUCCESS"
  | "FAILED"
  | "CANCELLED"
  | "AWAITING_2FA";

export type ExecMode = "A_only" | "B_only" | "A_and_B";

/** Calendar mapping from Excel room type to Lincoln calendar */
export interface CalendarMapping {
  excel_calendar: string;
  lincoln_calendar_id: string;
}

/** Process B mapping row */
export interface ProcessBRow {
  copy_source: string;
  plan_group_set: string;
  plan_name: string;
}

/** Output plan for STEPC */
export interface OutputPlan {
  value: string;
  label: string;
}

/** Typed job config — contents of config_json JSONB column */
export interface JobConfig {
  calendar_mappings?: CalendarMapping[];
  process_b_rows?: ProcessBRow[];
  output_plans?: OutputPlan[];
  plan_group_set_names?: string[];
}

export interface Job {
  id: string;
  facility_id: string;
  user_id: string | null;
  status: JobStatus;
  execution_mode: ExecMode;
  environment: string;
  last_completed_step: StepName | "DONE" | null;
  excel_file_path: string | null;
  excel_original_name: string | null;
  stay_type: "A" | "B" | null;
  target_period_from: string | null;
  target_period_to: string | null;
  config_json: Record<string, unknown> | null;
  retry_count: number;
}

/** Type-safe accessor for job config */
export function getJobConfig(job: Job): JobConfig {
  return (job.config_json ?? {}) as JobConfig;
}

export interface UserCredentials {
  lincoln_login_id: string;
  lincoln_login_pw: string;
}

/** Fetch a job by ID */
export async function getJob(jobId: string): Promise<Job> {
  const { data, error } = await getSupabase()
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (error || !data) {
    throw new Error(`Job ${jobId} not found: ${error?.message}`);
  }
  return data as Job;
}

/** Determine which steps remain, based on last completed step */
export function getNextSteps(lastCompleted: StepName | "DONE" | null): StepName[] {
  if (lastCompleted === "DONE") return [];
  if (lastCompleted === null) return [...STEPS];
  const idx = STEPS.indexOf(lastCompleted as StepName);
  if (idx === -1) return [...STEPS];
  return STEPS.slice(idx + 1) as unknown as StepName[];
}

/** Update job status (PENDING, RUNNING, SUCCESS, FAILED, CANCELLED) */
export async function updateJobStatus(
  jobId: string,
  status: JobStatus,
): Promise<void> {
  const { error } = await getSupabase()
    .from("jobs")
    .update({ status })
    .eq("id", jobId);

  if (error) throw new Error(`Failed to update job status: ${error.message}`);
}

/** Update last_completed_step */
export async function updateLastCompletedStep(
  jobId: string,
  step: StepName | "DONE",
): Promise<void> {
  const { error } = await getSupabase()
    .from("jobs")
    .update({ last_completed_step: step })
    .eq("id", jobId);

  if (error) {
    throw new Error(`Failed to update last_completed_step: ${error.message}`);
  }
}

/** Record step start in job_steps */
export async function recordStepStart(
  jobId: string,
  step: StepName,
  attempt: number,
): Promise<string> {
  const { data, error } = await getSupabase()
    .from("job_steps")
    .insert({
      job_id: jobId,
      step,
      status: "RUNNING",
      attempt,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to record step start: ${error?.message}`);
  }
  return data.id;
}

/** Record step success */
export async function recordStepSuccess(stepRecordId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("job_steps")
    .update({
      status: "SUCCESS",
      completed_at: new Date().toISOString(),
    })
    .eq("id", stepRecordId);

  if (error) {
    throw new Error(`Failed to record step success: ${error.message}`);
  }
}

/** Record step failure */
export async function recordStepFailure(
  stepRecordId: string,
  errorMessage: string,
): Promise<void> {
  const { error } = await getSupabase()
    .from("job_steps")
    .update({
      status: "FAILED",
      completed_at: new Date().toISOString(),
      error_message: errorMessage,
    })
    .eq("id", stepRecordId);

  if (error) {
    throw new Error(`Failed to record step failure: ${error.message}`);
  }
}

/**
 * Claim the next PENDING job (oldest first).
 * Uses optimistic locking: only claims if status is still PENDING.
 */
export async function claimNextJob(targetMachine?: string): Promise<Job | null> {
  // Only claim jobs explicitly targeted to this machine (never claim NULL target)
  const machineName = targetMachine ?? process.env.COMPUTERNAME ?? "";
  if (!machineName) {
    console.log("[runner] COMPUTERNAME not set — skipping job claim");
    return null;
  }

  const query = getSupabase()
    .from("jobs")
    .select("id")
    .eq("status", "PENDING")
    .eq("target_machine", machineName);

  const { data: pending } = await query
    .order("created_at", { ascending: true })
    .limit(1);

  if (!pending || pending.length === 0) return null;

  const jobId = pending[0].id;

  // Atomically claim it by updating status
  const { data, error } = await getSupabase()
    .from("jobs")
    .update({ status: "RUNNING" })
    .eq("id", jobId)
    .eq("status", "PENDING")
    .select("*")
    .single();

  if (error || !data) return null; // another worker claimed it
  return data as Job;
}

/** Check if a job has been cancelled */
export async function isJobCancelled(jobId: string): Promise<boolean> {
  const { data } = await getSupabase()
    .from("jobs")
    .select("status")
    .eq("id", jobId)
    .single();

  return data?.status === "CANCELLED";
}

/** Write a log entry to job_logs */
export async function writeJobLog(
  jobId: string,
  step: string | null,
  level: "info" | "warn" | "error" | "debug",
  message: string,
): Promise<void> {
  await getSupabase()
    .from("job_logs")
    .insert({ job_id: jobId, step, level, message });
}

/** Fetch user credentials for a job's user_id */
export async function getUserCredentials(
  userId: string,
): Promise<UserCredentials> {
  const { data, error } = await getSupabase()
    .from("user_lincoln_credentials")
    .select("lincoln_login_id, lincoln_login_pw")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    throw new Error(
      `No Lincoln credentials found for user ${userId}: ${error?.message}`,
    );
  }

  return data as UserCredentials;
}

/**
 * Filter steps based on execution mode.
 * A_only: skips STEPB
 * B_only: skips STEP0, STEPA
 * A_and_B: all steps
 */
export function filterStepsByExecMode(
  steps: StepName[],
  execMode: ExecMode,
): StepName[] {
  switch (execMode) {
    case "A_only":
      return steps.filter((s) => s !== "STEPB");
    case "B_only":
      return steps.filter((s) => s !== "STEPA" && s !== "STEP0");
    case "A_and_B":
      return steps;
  }
}

// --- Calendar sync ---

export interface CalendarSyncRequest {
  id: string;
  facility_id: string;
  status: string;
  user_id: string | null;
}

/** Claim the next PENDING calendar sync request for this machine */
export async function claimNextSyncRequest(): Promise<CalendarSyncRequest | null> {
  const machineName = process.env.COMPUTERNAME ?? "";
  if (!machineName) {
    console.log("[runner] COMPUTERNAME not set — skipping sync claim");
    return null;
  }

  // Only claim requests explicitly targeted to this machine (never claim NULL target)
  const query = getSupabase()
    .from("calendar_sync_requests")
    .select("id, facility_id, status, user_id")
    .eq("status", "PENDING")
    .eq("target_machine", machineName);

  const { data: pending } = await query
    .order("created_at", { ascending: true })
    .limit(1);

  if (!pending || pending.length === 0) return null;

  const reqId = pending[0].id;
  const { data, error } = await getSupabase()
    .from("calendar_sync_requests")
    .update({ status: "RUNNING" })
    .eq("id", reqId)
    .eq("status", "PENDING")
    .select("id, facility_id, status, user_id")
    .single();

  if (error || !data) return null;
  return data as CalendarSyncRequest;
}

export interface PlanNameEntry {
  plan_group_set_name: string;
  plan_name: string;
}

/** Complete a calendar sync request */
export async function completeSyncRequest(
  reqId: string,
  calendars: string[],
  facilityId: string,
  planGroupSetNames?: string[],
  planNames?: { planGroupSetName: string; names: string[] }[],
): Promise<void> {
  const sb = getSupabase();
  const now = new Date().toISOString();

  // Replace facility_calendars
  await sb.from("facility_calendars").delete().eq("facility_id", facilityId);
  if (calendars.length > 0) {
    await sb.from("facility_calendars").insert(
      calendars.map((name) => ({
        facility_id: facilityId,
        calendar_name: name,
        synced_at: now,
      })),
    );
  }

  // Replace facility_plan_group_names (if provided)
  if (planGroupSetNames) {
    await sb.from("facility_plan_group_names").delete().eq("facility_id", facilityId);
    if (planGroupSetNames.length > 0) {
      await sb.from("facility_plan_group_names").insert(
        planGroupSetNames.map((name) => ({
          facility_id: facilityId,
          plan_group_set_name: name,
          synced_at: now,
        })),
      );
    }
  }

  // Replace facility_plan_names (if provided)
  if (planNames) {
    console.log(`[sync] Saving plan names: ${planNames.length} sets, ${planNames.reduce((s, p) => s + p.names.length, 0)} total names`);
    await sb.from("facility_plan_names").delete().eq("facility_id", facilityId);
    const rows: { facility_id: string; plan_group_set_name: string; plan_name: string; synced_at: string }[] = [];
    for (const set of planNames) {
      for (const name of set.names) {
        rows.push({
          facility_id: facilityId,
          plan_group_set_name: set.planGroupSetName,
          plan_name: name,
          synced_at: now,
        });
      }
    }
    // Deduplicate rows (same plan name can appear in multiple room types within a set)
    const seen = new Set<string>();
    const uniqueRows = rows.filter((r) => {
      const key = `${r.plan_group_set_name}::${r.plan_name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    console.log(`[sync] Built ${uniqueRows.length} unique plan name rows (${rows.length - uniqueRows.length} duplicates removed)`);
    if (uniqueRows.length > 0) {
      // Insert in batches of 500 to stay within Supabase limits
      for (let i = 0; i < uniqueRows.length; i += 500) {
        const batch = uniqueRows.slice(i, i + 500);
        const { error: insertErr } = await sb.from("facility_plan_names").insert(batch);
        if (insertErr) {
          console.error(`[sync] Failed to insert plan names batch: ${insertErr.message}`);
        } else {
          console.log(`[sync] Inserted batch ${i / 500 + 1} (${batch.length} rows)`);
        }
      }
    }
  } else {
    console.log("[sync] No planNames provided to completeSyncRequest");
  }

  // Mark request as done
  await sb
    .from("calendar_sync_requests")
    .update({ status: "DONE", completed_at: now })
    .eq("id", reqId);
}

/** Fail a calendar sync request */
export async function failSyncRequest(
  reqId: string,
  errorMessage: string,
): Promise<void> {
  await getSupabase()
    .from("calendar_sync_requests")
    .update({
      status: "ERROR",
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq("id", reqId);
}

/** Get facility info by ID */
export async function getFacilityById(
  facilityId: string,
): Promise<{ lincoln_id: string; name: string }> {
  const { data, error } = await getSupabase()
    .from("facilities")
    .select("lincoln_id, name")
    .eq("id", facilityId)
    .single();
  if (error || !data) throw new Error(`Facility not found: ${facilityId}`);
  return data;
}

/** Download file from Supabase Storage to local temp path */
export async function downloadFromStorage(
  storagePath: string,
  localPath: string,
): Promise<void> {
  const { data, error } = await getSupabase()
    .storage
    .from("lincoln-excel-uploads")
    .download(storagePath);

  if (error || !data) {
    throw new Error(`Failed to download from storage: ${error?.message}`);
  }

  const { writeFile, mkdir } = await import("fs/promises");
  const { dirname } = await import("path");
  await mkdir(dirname(localPath), { recursive: true });
  const buffer = Buffer.from(await data.arrayBuffer());
  await writeFile(localPath, buffer);
}
