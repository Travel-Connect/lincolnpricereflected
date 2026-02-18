/**
 * Lincoln Runner — CLI entry point.
 * Usage: npx tsx src/main.ts --job-id <uuid>
 *
 * Fetches a job from Supabase, determines remaining steps via
 * last_completed_step (resume support), and executes them in order.
 *
 * Auth flow: login → 2FA (if needed) → session save → steps
 * Session persistence: reuses saved cookies to skip 2FA on subsequent runs.
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
import {
  login,
  waitFor2FA,
  hasSavedSession,
  getSessionPath,
  saveSession,
  clearSession,
} from "./auth/index.js";

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

  // 4. Launch browser (with saved session if available)
  const headless = process.env.PLAYWRIGHT_HEADLESS === "true";
  const browser = await chromium.launch({ headless });
  const contextOptions = hasSavedSession()
    ? { storageState: getSessionPath() }
    : {};
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  // 5. Attach network recorder
  const recorder = new NetworkRecorder();
  recorder.attach(page);

  try {
    // 6. Auth: Login → 2FA → Session save
    // Only needed for steps that require the browser (STEP0+)
    const needsBrowser = steps.some((s) => s !== "PARSE");
    if (needsBrowser) {
      await performAuth(page, context);
    }

    // 7. Execute each step
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

    // 8. All steps done
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

/**
 * Perform Lincoln authentication.
 * Tries saved session first; falls back to fresh login + 2FA.
 */
async function performAuth(
  page: import("playwright").Page,
  context: import("playwright").BrowserContext,
): Promise<void> {
  const loginId = process.env.LINCOLN_LOGIN_ID;
  const loginPw = process.env.LINCOLN_LOGIN_PW;

  if (!loginId || !loginPw) {
    throw new Error(
      "Missing LINCOLN_LOGIN_ID or LINCOLN_LOGIN_PW in environment",
    );
  }

  // Try saved session — navigate to top page and see if we're still logged in
  if (hasSavedSession()) {
    console.log("[runner] Attempting session restore...");
    await page.goto(
      "https://www.tl-lincoln.net/accomodation/Ascsc1010InitAction.do",
      { waitUntil: "networkidle", timeout: 15000 },
    ).catch(() => {});

    const title = await page.title();
    if (title.includes("トップページ") || title.includes("メニュー")) {
      console.log("[runner] Session restored — skipping login");
      return;
    }

    console.log("[runner] Saved session expired — performing fresh login");
    clearSession();
  }

  // Fresh login
  const result = await login(page, loginId, loginPw);

  if (result.needs2FA) {
    await waitFor2FA(page);
  }

  // Verify we're on a post-login page
  const title = await page.title();
  if (title.includes("ログイン") || title.includes("認証")) {
    throw new Error(`[auth] Login appears to have failed. Page title: ${title}`);
  }

  // Save session for next run
  await saveSession(context);
  console.log("[runner] Auth completed successfully");
}

main().catch((err) => {
  console.error("[runner] Unexpected error:", err);
  process.exit(2);
});
