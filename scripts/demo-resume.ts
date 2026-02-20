/**
 * Demo resume — 前回の PARSE 済みジョブから STEPA → STEP0 → STEPB を再実行。
 *
 * Usage:
 *   cd apps/runner
 *   npx tsx ../../scripts/demo-resume.ts --job-id <uuid>
 */

import "dotenv/config";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { chromium } from "playwright";
import { existsSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, "..", ".env") });

const FACILITY_LINCOLN_ID = "Y77131";
const SLOW_MO_MS = 300;
const SESSION_FILE = resolve(__dirname, "..", "data", "artifacts", "lincoln-session.json");

function getJobId(): string {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--job-id");
  if (idx === -1 || idx + 1 >= args.length) {
    console.error('Usage: npx tsx ../../scripts/demo-resume.ts --job-id <uuid>');
    process.exit(1);
  }
  return args[idx + 1];
}

async function main() {
  const jobId = getJobId();

  console.log("╔══════════════════════════════════════════╗");
  console.log("║  Lincoln Demo Resume (slowMo mode)       ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log(`  ジョブID: ${jobId}`);
  console.log(`  slowMo:   ${SLOW_MO_MS}ms`);
  console.log();

  const { getJob, updateLastCompletedStep, updateJobStatus } = await import(
    "../apps/runner/src/job-state.js"
  );

  const job = await getJob(jobId);
  console.log(`[demo] Job status: ${job.status}, last_completed: ${job.last_completed_step}`);

  // Reset job to PARSE completed so STEPA and STEP0 will run
  await updateLastCompletedStep(jobId, "PARSE");
  await updateJobStatus(jobId, "RUNNING");

  // Launch browser (regular context, storageState for session persistence)
  const hasSession = existsSync(SESSION_FILE);
  console.log(`[demo] ブラウザ起動中 (slowMo mode)...`);
  if (hasSession) {
    console.log(`[demo] Session: ${SESSION_FILE} (既存セッション読み込み)`);
  }
  const browser = await chromium.launch({
    headless: false,
    slowMo: SLOW_MO_MS,
  });
  const context = await browser.newContext(
    hasSession ? { storageState: SESSION_FILE } : {},
  );
  const page = await context.newPage();

  try {
    // Login
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  AUTH: Lincoln ログイン");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const { login, waitFor2FA } = await import("../apps/runner/src/auth/index.js");

    const loginId = process.env.LINCOLN_LOGIN_ID!;
    const loginPw = process.env.LINCOLN_LOGIN_PW!;
    const loginResult = await login(page, loginId, loginPw);

    if (loginResult.needs2FA) {
      console.log("[demo] 2FA 必要 — ブラウザで入力してください...");
      await waitFor2FA(page);
    }
    console.log("[demo] ✓ ログイン完了\n");

    // Facility switch
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  施設切替: 畳の宿 那覇壺屋");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const { switchFacility } = await import("../apps/runner/src/auth/facility-switch.js");
    await switchFacility(page, "畳の宿", FACILITY_LINCOLN_ID);
    console.log("[demo] ✓ 施設切替完了\n");

    // STEPA
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  STEP: STEPA (施設ID一致チェック)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    let currentJob = await getJob(jobId);
    const { run: runStepA } = await import("../apps/runner/src/steps/step-a.js");
    await runStepA(jobId, page, currentJob);
    await updateLastCompletedStep(jobId, "STEPA");
    console.log("[demo] ✓ STEPA 完了\n");

    // STEP0
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  STEP: STEP0 (カレンダーランク反映)");
    console.log("  → テストカレンダー を使用");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    currentJob = await getJob(jobId);
    const { run: runStep0 } = await import("../apps/runner/src/steps/step0.js");
    await runStep0(jobId, page, currentJob);
    await updateLastCompletedStep(jobId, "STEP0");
    console.log("[demo] ✓ STEP0 完了\n");

    // STEPB
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  STEP: STEPB (料金ランク一括設定)");
    console.log("  → テストカレンダー → カレンダーテスト");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    currentJob = await getJob(jobId);
    const { run: runStepB } = await import("../apps/runner/src/steps/step-b.js");
    await runStepB(jobId, page, currentJob);
    await updateLastCompletedStep(jobId, "STEPB");
    console.log("[demo] ✓ STEPB 完了\n");

    // STEPC
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  STEP: STEPC (出力→突合検証)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    currentJob = await getJob(jobId);
    const { run: runStepC } = await import("../apps/runner/src/steps/step-c.js");
    const outputFile = await runStepC(jobId, page, currentJob);
    await updateLastCompletedStep(jobId, "STEPC");
    console.log(`[demo] ✓ STEPC 完了 — 出力ファイル: ${outputFile}\n`);

    await updateLastCompletedStep(jobId, "DONE");
    await updateJobStatus(jobId, "SUCCESS");

    // Save session state for next run
    await context.storageState({ path: SESSION_FILE });
    console.log(`[demo] セッション保存: ${SESSION_FILE}`);

    console.log("╔══════════════════════════════════════════╗");
    console.log("║  ✓ デモ実行完了！                        ║");
    console.log("╚══════════════════════════════════════════╝");

    await browser.close();

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n[demo] ✗ 失敗: ${message}`);
    await updateJobStatus(jobId, "FAILED");

    try {
      const { saveScreenshot, saveHtml } = await import("../apps/runner/src/artifact-writer.js");
      await saveScreenshot(page, jobId, "demo-error");
      await saveHtml(page, jobId, "demo-error");
      console.log("[demo] エラー時アーティファクト保存済み");
    } catch { /* ignore */ }

    await browser.close();
  }
}

main().catch((err) => {
  console.error("[demo] Unexpected:", err);
  process.exit(2);
});
