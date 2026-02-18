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
  | "CANCELLED";

export interface Job {
  id: string;
  facility_id: string;
  status: JobStatus;
  last_completed_step: StepName | "DONE" | null;
  excel_file_path: string | null;
  excel_original_name: string | null;
  stay_type: "A" | "B" | null;
  target_period_from: string | null;
  target_period_to: string | null;
  retry_count: number;
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
