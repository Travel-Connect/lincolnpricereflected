/**
 * Lincoln Runner — CLI entry point.
 * Usage: npx tsx src/main.ts --job-id <uuid>
 *
 * Fetches a job from Supabase, determines remaining steps via
 * last_completed_step (resume support), and executes them in order.
 */

import "dotenv/config";
import { chromium } from "playwright";
import {
  getJob,
  getNextSteps,
  updateJobStatus,
  updateLastCompletedStep,
  recordStepStart,
  recordStepSuccess,
  recordStepFailure,
  type StepName,
} from "./job-state.js";
import { STEP_REGISTRY } from "./steps/index.js";
import { withRetry } from "./retry.js";
import { saveScreenshot, saveHtml } from "./artifact-writer.js";
import { NetworkRecorder } from "./network-recorder.js";
import { OperationTimeoutError, NetworkError } from "./errors.js";

/** Parse --job-id from CLI args */
function parseArgs(): string {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--job-id");
  if (idx === -1 || idx + 1 >= args.length) {
    console.error("Usage: npx tsx src/main.ts --job-id <uuid>");
    process.exit(1);
  }
  return args[idx + 1];
}

/** Check if an error is eligible for retry */
function isRetryable(err: unknown): boolean {
  return (
    err instanceof OperationTimeoutError || err instanceof NetworkError
  );
}

async function main(): Promise<void> {
  const jobId = parseArgs();
  console.log(`[runner] Starting job ${jobId}`);

  // 1. Fetch job from Supabase
  const job = await getJob(jobId);
  console.log(
    `[runner] Facility: ${job.facility_id}, status: ${job.status}, last_completed: ${job.last_completed_step ?? "none"}`,
  );

  // 2. Determine remaining steps
  const steps = getNextSteps(job.last_completed_step);
  if (steps.length === 0) {
    console.log("[runner] All steps already completed");
    return;
  }
  console.log(`[runner] Steps to execute: ${steps.join(" → ")}`);

  // 3. Mark job as RUNNING
  await updateJobStatus(jobId, "RUNNING");

  // 4. Launch browser
  const headless = process.env.PLAYWRIGHT_HEADLESS === "true";
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  // 5. Attach network recorder
  const recorder = new NetworkRecorder();
  recorder.attach(page);

  try {
    // 6. Execute each step
    for (const step of steps) {
      const stepFn = STEP_REGISTRY[step];
      console.log(`[runner] ▶ ${step}`);

      const stepRecordId = await recordStepStart(jobId, step, 1);

      try {
        await withRetry(() => stepFn(jobId, page, job), {
          maxAttempts: job.retry_count,
          onRetry: (attempt, err) => {
            console.log(
              `[runner] Retry ${attempt} for ${step}: ${err.message}`,
            );
          },
        });

        await recordStepSuccess(stepRecordId);
        await updateLastCompletedStep(jobId, step);
        console.log(`[runner] ✓ ${step} completed`);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err);
        await recordStepFailure(stepRecordId, message);

        // Save artifacts on failure
        try {
          await saveScreenshot(page, jobId, step);
          await saveHtml(page, jobId, step);
        } catch {
          console.error("[runner] Failed to save failure artifacts");
        }

        throw err;
      }
    }

    // 7. All steps done
    await updateLastCompletedStep(jobId, "DONE");
    await updateJobStatus(jobId, "SUCCESS");
    console.log("[runner] ✓ Job completed successfully");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[runner] ✗ Job failed: ${message}`);
    await updateJobStatus(jobId, "FAILED");
    process.exitCode = 1;
  } finally {
    recorder.detach(page);
    await browser.close();
  }
}

main().catch((err) => {
  console.error("[runner] Unexpected error:", err);
  process.exit(2);
});
