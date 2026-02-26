/**
 * Lincoln Runner — CLI entry point.
 *
 * Two modes:
 *   npx tsx src/main.ts --job-id <uuid>   — run a single job
 *   npx tsx src/main.ts --poll             — poll for PENDING jobs continuously
 *
 * Auth flow: login → 2FA (if needed) → session save → steps
 * Session persistence: reuses saved cookies to skip 2FA on subsequent runs.
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load .env from project root (not CWD)
const PROJECT_ROOT = resolve(import.meta.dirname, "..", "..", "..");
config({ path: resolve(PROJECT_ROOT, ".env") });
import { chromium } from "playwright";
import {
  getJob,
  getNextSteps,
  filterStepsByExecMode,
  updateJobStatus,
  updateLastCompletedStep,
  recordStepStart,
  recordStepSuccess,
  recordStepFailure,
  claimNextJob,
  isJobCancelled,
  writeJobLog,
  getUserCredentials,
  downloadFromStorage,
  type Job,
  type StepName,
  type UserCredentials,
} from "./job-state.js";
import { STEP_REGISTRY } from "./steps/index.js";
import { withRetry } from "./retry.js";
import { saveScreenshot, saveHtml } from "./artifact-writer.js";
import { NetworkRecorder } from "./network-recorder.js";
import {
  login,
  waitFor2FA,
  hasSavedSession,
  getSessionPath,
  saveSession,
  clearSession,
} from "./auth/index.js";
import { processNextSyncRequest } from "./sync-calendar.js";

const POLL_INTERVAL_MS = 5000;

/** Parse CLI args */
interface CliArgs {
  mode: "single" | "poll";
  jobId?: string;
  keepBrowser: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const keepBrowser = args.includes("--keep-browser");

  if (args.includes("--poll")) {
    return { mode: "poll", keepBrowser };
  }

  const idx = args.indexOf("--job-id");
  if (idx === -1 || idx + 1 >= args.length) {
    console.error("Usage: npx tsx src/main.ts --job-id <uuid> [--keep-browser]");
    console.error("       npx tsx src/main.ts --poll [--keep-browser]");
    process.exit(1);
  }
  return { mode: "single", jobId: args[idx + 1], keepBrowser };
}

/** Resolve the Excel file path: download from Storage if needed */
async function resolveExcelPath(job: Job): Promise<string> {
  const filePath = job.excel_file_path;
  if (!filePath) throw new Error("No excel_file_path on job");

  // Local absolute path — use directly (handles C:\, C:/, and /unix/path)
  if (filePath.startsWith("/") || filePath.match(/^[A-Z]:[/\\]/i)) {
    return filePath;
  }

  // Storage path — download to local temp
  const localDir = resolve(PROJECT_ROOT, "data", "downloads");
  const localPath = resolve(localDir, `${job.id}_${filePath.split("/").pop()}`);
  console.log(`[runner] Downloading Excel from Storage: ${filePath}`);
  await downloadFromStorage(filePath, localPath);
  console.log(`[runner] Downloaded to: ${localPath}`);

  // Update job with local path for the PARSE step
  return localPath;
}

/** Get credentials: from job's user_id or fallback to env vars */
async function getCredentials(job: Job): Promise<UserCredentials> {
  if (job.user_id) {
    try {
      return await getUserCredentials(job.user_id);
    } catch {
      console.log(
        "[runner] User credentials not found, falling back to env vars",
      );
    }
  }

  const loginId = process.env.LINCOLN_LOGIN_ID;
  const loginPw = process.env.LINCOLN_LOGIN_PW;

  if (!loginId || !loginPw) {
    throw new Error(
      "Missing LINCOLN_LOGIN_ID/PW in env and no user credentials in DB",
    );
  }

  return { lincoln_login_id: loginId, lincoln_login_pw: loginPw };
}

/** Execute a single job */
async function executeJob(
  job: Job,
  keepBrowserOpen = false,
): Promise<void> {
  const jobId = job.id;
  console.log(`[runner] Starting job ${jobId}`);
  await writeJobLog(jobId, null, "info", "ジョブ開始");

  // Resolve Excel path (download from Storage if needed)
  const localExcelPath = await resolveExcelPath(job);
  const jobWithLocalPath: Job = { ...job, excel_file_path: localExcelPath };

  // Determine remaining steps, filtered by exec_mode
  const allNextSteps = getNextSteps(job.last_completed_step);
  let steps = filterStepsByExecMode(
    allNextSteps,
    job.execution_mode ?? "A_and_B",
  );

  if (steps.length === 0) {
    console.log("[runner] All steps already completed");
    await updateJobStatus(jobId, "SUCCESS");
    return;
  }
  console.log(`[runner] Steps to execute: ${steps.join(" → ")}`);
  await writeJobLog(jobId, null, "info", `実行ステップ: ${steps.join(" → ")}`);

  // Launch browser (maximized)
  const headless = process.env.PLAYWRIGHT_HEADLESS === "true";
  const browser = await chromium.launch({
    headless,
    args: ["--start-maximized"],
  });
  const contextOptions = hasSavedSession()
    ? { storageState: getSessionPath() }
    : {};
  const context = await browser.newContext({
    ...contextOptions,
    viewport: null, // use full window size (maximized)
  });
  const page = await context.newPage();

  const recorder = new NetworkRecorder();
  recorder.attach(page);

  try {
    // Auth (skip for PARSE-only)
    const needsBrowser = steps.some((s) => s !== "PARSE");
    let didFreshLogin = false;
    if (needsBrowser) {
      const creds = await getCredentials(job);
      didFreshLogin = await performAuth(page, context, jobId, creds);
    }

    // If fresh login was performed, ensure STEPA runs (to switch facility)
    // Fresh login lands on default facility, so STEPA must re-run
    if (didFreshLogin && !steps.includes("STEPA")) {
      console.log("[runner] Fresh login detected — adding STEPA to ensure facility switch");
      await writeJobLog(jobId, null, "info", "再ログイン検出 — 施設切替(STEPA)を再実行");
      steps.unshift("STEPA");
    }

    // Execute each step
    for (const step of steps) {
      // Abort check
      if (await isJobCancelled(jobId)) {
        console.log("[runner] Job cancelled by user");
        await writeJobLog(jobId, step, "warn", "ユーザーによりジョブ中止");
        await updateJobStatus(jobId, "CANCELLED");
        return;
      }

      const stepFn = STEP_REGISTRY[step];
      console.log(`[runner] ▶ ${step}`);
      await writeJobLog(jobId, step, "info", `${step} 開始`);

      const stepRecordId = await recordStepStart(jobId, step, 1);

      try {
        await withRetry(() => stepFn(jobId, page, jobWithLocalPath), {
          maxAttempts: job.retry_count,
          onRetry: (attempt, err) => {
            console.log(
              `[runner] Retry ${attempt} for ${step}: ${err.message}`,
            );
            writeJobLog(
              jobId,
              step,
              "warn",
              `リトライ ${attempt}: ${err.message}`,
            );
          },
        });

        await recordStepSuccess(stepRecordId);
        await updateLastCompletedStep(jobId, step);
        await writeJobLog(jobId, step, "info", `${step} 完了`);
        console.log(`[runner] ✓ ${step} completed`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await recordStepFailure(stepRecordId, message);
        await writeJobLog(jobId, step, "error", `${step} 失敗: ${message}`);

        try {
          await saveScreenshot(page, jobId, step);
          await saveHtml(page, jobId, step);
        } catch {
          console.error("[runner] Failed to save failure artifacts");
        }

        throw err;
      }
    }

    // All steps done
    await updateLastCompletedStep(jobId, "DONE");
    await updateJobStatus(jobId, "SUCCESS");
    await writeJobLog(jobId, null, "info", "ジョブ正常完了");
    console.log("[runner] ✓ Job completed successfully");

    // Navigate to verification page for visual inspection
    await navigateToVerificationPage(page, jobWithLocalPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[runner] ✗ Job failed: ${message}`);
    await updateJobStatus(jobId, "FAILED");
  } finally {
    recorder.detach(page);
    if (keepBrowserOpen) {
      console.log(
        "[runner] ブラウザを開いたまま保持中。確認後 Ctrl+C で終了してください。",
      );
      // Block forever to keep browser alive — Ctrl+C to exit
      await new Promise<never>(() => {});
    } else {
      await browser.close();
    }
  }
}

/**
 * Perform Lincoln authentication.
 * Tries saved session first; falls back to fresh login + 2FA.
 * Returns true if a fresh login was performed (session was not restored).
 */
async function performAuth(
  page: import("playwright").Page,
  context: import("playwright").BrowserContext,
  jobId: string,
  creds: UserCredentials,
): Promise<boolean> {
  // Try saved session
  if (hasSavedSession()) {
    console.log("[runner] Attempting session restore...");
    await writeJobLog(jobId, null, "info", "セッション復元を試行中");
    await page
      .goto(
        "https://www.tl-lincoln.net/accomodation/Ascsc1010InitAction.do",
        { waitUntil: "networkidle", timeout: 15000 },
      )
      .catch(() => {});

    const title = await page.title();
    if (title.includes("トップページ") || title.includes("メニュー")) {
      console.log("[runner] Session restored — skipping login");
      await writeJobLog(jobId, null, "info", "セッション復元成功");
      return false; // session restored, no fresh login
    }

    console.log("[runner] Saved session expired — performing fresh login");
    clearSession();
  }

  // Fresh login
  await writeJobLog(jobId, null, "info", "ログイン中...");
  const result = await login(
    page,
    creds.lincoln_login_id,
    creds.lincoln_login_pw,
  );

  if (result.needs2FA) {
    await updateJobStatus(jobId, "AWAITING_2FA");
    await writeJobLog(
      jobId,
      null,
      "warn",
      "二段階認証が必要です。ブラウザでコードを入力してください。",
    );
    await waitFor2FA(page);
    await updateJobStatus(jobId, "RUNNING");
    await writeJobLog(jobId, null, "info", "二段階認証完了");
  }

  // Verify post-login
  const title = await page.title();
  if (title.includes("ログイン") || title.includes("認証")) {
    throw new Error(
      `[auth] Login appears to have failed. Page title: ${title}`,
    );
  }

  // Save session
  await saveSession(context);
  await writeJobLog(jobId, null, "info", "認証完了");
  console.log("[runner] Auth completed successfully");
  return true; // fresh login performed
}

const LINCOLN_BASE = "https://www.tl-lincoln.net/accomodation/";

/**
 * Navigate to the 5010 price management page for visual verification.
 * Selects the plan group set configured in the job if available.
 */
async function navigateToVerificationPage(
  page: import("playwright").Page,
  job: Job,
): Promise<void> {
  try {
    const url5010 = LINCOLN_BASE + "Ascsc5010InitAction.do";
    console.log("[runner] Navigating to 5010 (料金管理) for verification...");
    await page.goto(url5010, { waitUntil: "networkidle", timeout: 30000 });
    console.log(`[runner] On page: ${await page.title()}`);

    // Try to select the configured plan group set
    const planGroupSetNames =
      (job as any).config_json?.plan_group_set_names as string[] | undefined;
    const targetName = planGroupSetNames?.[0];

    if (targetName) {
      console.log(
        `[runner] Looking for plan group set: "${targetName}" on 5010...`,
      );

      // Plan group set items use the same selector as stepB
      const setItem = page
        .locator('a[onclick*="selectPlanGroupSet"]')
        .filter({ hasText: targetName })
        .first();

      if (await setItem.isVisible({ timeout: 5000 }).catch(() => false)) {
        await setItem.click();
        await page
          .waitForLoadState("networkidle", { timeout: 15000 })
          .catch(() => {});
        await page.waitForTimeout(1000);
        console.log(`[runner] Plan group set "${targetName}" selected on 5010`);
      } else {
        console.log(
          `[runner] Plan group set "${targetName}" not found on 5010 — showing default view`,
        );
      }
    }
  } catch (err) {
    // Non-critical — don't fail the job for navigation issues
    console.log(
      `[runner] Could not navigate to 5010: ${err instanceof Error ? err.message : err}`,
    );
  }
}

/** Polling loop: continuously claim and execute PENDING jobs and sync requests */
async function pollLoop(keepBrowser: boolean): Promise<void> {
  console.log("[runner] Starting poll mode (press Ctrl+C to stop)");
  console.log(`[runner] Poll interval: ${POLL_INTERVAL_MS}ms`);
  if (keepBrowser) {
    console.log("[runner] --keep-browser: ジョブ完了後もブラウザを保持します");
  }

  while (true) {
    try {
      // Check for calendar sync requests first (lightweight)
      const didSync = await processNextSyncRequest();
      if (didSync) continue; // Check for more work immediately

      // Check for pending jobs
      const job = await claimNextJob();
      if (job) {
        console.log(`[runner] Claimed job ${job.id}`);
        await executeJob(job, keepBrowser);
        continue; // Check for more work immediately
      }
    } catch (err) {
      console.error(
        "[runner] Poll error:",
        err instanceof Error ? err.message : err,
      );
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

// --- Entry point ---
async function main(): Promise<void> {
  const args = parseArgs();

  if (args.mode === "poll") {
    await pollLoop(args.keepBrowser);
  } else {
    const job = await getJob(args.jobId!);
    await updateJobStatus(args.jobId!, "RUNNING");
    await executeJob(job, args.keepBrowser);
  }
}

main().catch((err) => {
  console.error("[runner] Unexpected error:", err);
  process.exit(2);
});
