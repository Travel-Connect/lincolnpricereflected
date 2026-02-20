/**
 * Demo STEPC only — 5070 出力テスト。
 * 既存の STEPB 完了済みジョブから STEPC だけを実行する。
 *
 * Usage:
 *   cd apps/runner
 *   npx tsx ../../scripts/demo-stepc.ts --job-id <uuid>
 *
 * ジョブIDなしの場合はダミージョブで 5070 出力のみテスト:
 *   npx tsx ../../scripts/demo-stepc.ts
 */

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
const SESSION_FILE = resolve(
  __dirname,
  "..",
  "data",
  "artifacts",
  "lincoln-session.json",
);

function getJobId(): string | null {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--job-id");
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

async function main() {
  const jobId = getJobId();

  console.log("╔══════════════════════════════════════════╗");
  console.log("║  Lincoln Demo STEPC (5070 出力テスト)    ║");
  console.log("╚══════════════════════════════════════════╝");
  if (jobId) {
    console.log(`  ジョブID: ${jobId}`);
  } else {
    console.log("  ジョブID: なし (ダミーで実行)");
  }
  console.log();

  // Import modules
  const { getJob, updateLastCompletedStep, updateJobStatus } = await import(
    "../apps/runner/src/job-state.js"
  );

  // If no jobId, create a dummy job just for the facility reference
  let effectiveJobId = jobId;
  if (!effectiveJobId) {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { db: { schema: "lincoln" } },
    );
    // Get facility UUID
    const { data: facData } = await sb
      .from("facilities")
      .select("id")
      .eq("lincoln_id", FACILITY_LINCOLN_ID)
      .single();
    if (!facData) throw new Error("Facility not found");

    const { data: jobData, error } = await sb
      .from("jobs")
      .insert({
        facility_id: facData.id,
        status: "RUNNING",
        excel_file_path: "dummy-stepc-test",
        excel_original_name: "stepc-test.xlsx",
        last_completed_step: "STEPB",
        retry_count: 1,
      })
      .select("id")
      .single();
    if (error || !jobData) throw new Error(`Job creation failed: ${error?.message}`);
    effectiveJobId = jobData.id;
    console.log(`[demo] ダミージョブ作成: ${effectiveJobId}`);
  }

  // Launch browser
  const hasSession = existsSync(SESSION_FILE);
  console.log("[demo] ブラウザ起動中...");
  const browser = await chromium.launch({ headless: false, slowMo: SLOW_MO_MS });
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
    const loginResult = await login(
      page,
      process.env.LINCOLN_LOGIN_ID!,
      process.env.LINCOLN_LOGIN_PW!,
    );
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

    // STEPC
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  STEP: STEPC (出力→突合検証)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const currentJob = await getJob(effectiveJobId);
    const { run: runStepC } = await import("../apps/runner/src/steps/step-c.js");
    // Skip verification for dummy jobs (no expected ranks in DB)
    const skipVerification = !jobId;
    const outputFile = await runStepC(effectiveJobId, page, currentJob, {
      skipVerification,
      outputPlans: [
        { value: "6,25", label: "和室コンド / 【+40%】海外ラック単泊_素泊まり" },
        { value: "6,32", label: "和室コンド / 公式【-14.5%】連泊_素泊まり" },
        { value: "5,24", label: "和室コンド ～5名仕様～ / 【+40%】海外ラック単泊_素泊まり" },
        { value: "5,17", label: "和室コンド ～5名仕様～ / 公式【-14.5%】連泊_素泊まり" },
      ],
    });
    await updateLastCompletedStep(effectiveJobId, "STEPC");
    console.log(`[demo] ✓ STEPC 完了 — 出力ファイル: ${outputFile}\n`);

    // Save session
    await context.storageState({ path: SESSION_FILE });
    console.log(`[demo] セッション保存: ${SESSION_FILE}`);

    console.log("╔══════════════════════════════════════════╗");
    console.log("║  ✓ STEPC テスト完了！                    ║");
    console.log("╚══════════════════════════════════════════╝");

    await browser.close();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n[demo] ✗ 失敗: ${message}`);
    if (err instanceof Error && err.stack) {
      console.error(err.stack);
    }

    try {
      const { saveScreenshot, saveHtml } = await import("../apps/runner/src/artifact-writer.js");
      await saveScreenshot(page, effectiveJobId, "stepc-error");
      await saveHtml(page, effectiveJobId, "stepc-error");
      console.log("[demo] エラー時アーティファクト保存済み");
    } catch { /* ignore */ }

    await browser.close();
  }
}

main().catch((err) => {
  console.error("[demo] Unexpected:", err);
  process.exit(2);
});
