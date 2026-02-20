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
export async function claimNextJob(): Promise<Job | null> {
  // Find oldest pending job
  const { data: pending } = await getSupabase()
    .from("jobs")
    .select("id")
    .eq("status", "PENDING")
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
